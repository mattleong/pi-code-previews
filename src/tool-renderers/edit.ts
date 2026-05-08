import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { createEditToolDefinition, getLanguageFromPath } from "@mariozechner/pi-coding-agent";
import { Container, Text, type Component } from "@mariozechner/pi-tui";
import { AsyncPreview, shouldRenderAsync } from "../async-preview.ts";
import { getEditDiff, getObjectValue, getPathArg, getTextContent } from "../data.ts";
import {
  createProgressiveSyntaxHighlightedDiffText,
  FullWidthDiffText,
  renderPlainDiff,
  renderSyntaxHighlightedDiff,
  summarizeDiff,
} from "../diff.ts";
import { diffSummarySeparator, type DiffSummary } from "../diff-summary.ts";
import { countLabel, previewFooter, showingFooter, themedKeyHint } from "../format.ts";
import { resolvePreviewLanguage } from "../language.ts";
import { renderDisplayPath } from "../paths.ts";
import { codePreviewSettings } from "../settings.ts";
import { shouldSkipHighlight } from "../shiki.ts";
import { escapeControlChars } from "../terminal-text.ts";
import { createSimpleDiff } from "../write-diff.ts";
import {
  cachedPreview,
  createCodePreviewToolShell,
  previewArgsKey,
  previewCacheKey,
} from "./common.ts";

export function registerEdit(pi: ExtensionAPI, cwd: string) {
  const originalEdit = createEditToolDefinition(cwd);
  const previewShell = createCodePreviewToolShell();

  pi.registerTool({
    ...originalEdit,
    // The built-in edit tool uses renderShell: "self". Use the standard Pi box
    // by default, or self-render when the user disables/reframes tool-call backgrounds.
    renderShell: previewShell.renderShell,

    renderCall(args, theme, context) {
      return previewShell.renderCall(context, theme, (renderContext) => {
        const path = getPathArg(args);
        const operations = getEditPreviewOperations(args);
        const operationsSource = editOperationsSource(operations);
        const argsKey = previewArgsKey("edit-args", operationsSource, path);
        if (renderContext.state.editArgsKey !== argsKey) {
          renderContext.state.editArgsKey = argsKey;
          renderContext.state.editSummaryText = undefined;
          renderContext.state.editCallPreviewKey = undefined;
          renderContext.state.editCallPreviewComponent = undefined;
        }

        const text =
          renderContext.lastComponent instanceof Text
            ? renderContext.lastComponent
            : new Text("", 0, 0);
        renderContext.state.editHeaderText = text;
        text.setText(formatEditHeader(path, cwd, theme, renderContext.state.editSummaryText));

        if (
          !renderContext.argsComplete ||
          operations.length === 0 ||
          renderContext.executionStarted
        )
          return text;

        const previewKey = previewCacheKey(
          "edit-call",
          operationsSource,
          path,
          renderContext.expanded,
          theme,
        );
        if (renderContext.state.editCallPreviewKey !== previewKey) {
          renderContext.state.editCallPreviewKey = previewKey;
          const render = () =>
            renderEditCallPreview(
              operations,
              path,
              renderContext.expanded,
              theme,
              renderContext.invalidate,
            );
          renderContext.state.editCallPreviewComponent = shouldRenderAsync(operationsSource)
            ? new AsyncPreview(
                "Rendering proposed edit diff…",
                theme,
                render,
                renderContext.invalidate,
              )
            : render();
        }
        return new HeaderAndBody(text, renderContext.state.editCallPreviewComponent as Component);
      });
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      return previewShell.renderResult(context, theme, (renderContext) => {
        if (isPartial) return new Text(theme.fg("warning", "Editing…"), 0, 0);

        const firstText = getTextContent(result.content);
        if (renderContext.isError) {
          renderContext.state.editSummaryText = undefined;
          updateEditHeader(renderContext, cwd, theme);
          return new Text(
            theme.fg("error", escapeControlChars(firstText.split("\n")[0] || "Edit failed")),
            0,
            0,
          );
        }

        const diff = getEditDiff(result.details);
        if (!diff) {
          renderContext.state.editSummaryText = `${theme.fg("success", "✓ Edit applied")}${theme.fg("muted", " · no diff")}`;
          updateEditHeader(renderContext, cwd, theme);
          return new Container();
        }

        const filePath = getPathArg(renderContext.args);
        const lang = resolvePreviewLanguage({
          path: filePath,
          piLanguage: getLanguageFromPath(filePath),
        });
        const summary = summarizeDiff(diff);
        const limit =
          expanded || codePreviewSettings.editCollapsedLines === "all"
            ? summary.totalLines
            : codePreviewSettings.editCollapsedLines;
        renderContext.state.editSummaryText = formatEditSummary(summary, limit, theme);
        if (!expanded && summary.totalLines > limit)
          renderContext.state.editSummaryText += ` (${themedKeyHint(theme, "app.tools.expand", "expand")})`;
        updateEditHeader(renderContext, cwd, theme);
        const render = () =>
          renderEditDiffPreview(
            diff,
            lang,
            limit,
            summary.totalLines,
            theme,
            renderContext.invalidate,
          );
        const previewKey = previewCacheKey("edit-result", diff, filePath, expanded, theme);
        return cachedPreview(
          renderContext.state,
          "editResultPreviewKey",
          "editResultPreviewComponent",
          previewKey,
          () =>
            shouldRenderAsync(diff)
              ? new AsyncPreview("Rendering edit diff…", theme, render, renderContext.invalidate)
              : render(),
        );
      });
    },
  });
}

function renderEditDiffPreview(
  diff: string,
  lang: string | undefined,
  limit: number,
  totalLines: number,
  theme: Theme,
  invalidate?: () => void,
): FullWidthDiffText {
  const skipSyntaxHighlight = shouldSkipHighlight(diff);
  const footer = (body: string) => {
    let text = body;
    if (totalLines > limit) text += showingFooter(theme, limit, totalLines, "diff lines");
    if (skipSyntaxHighlight)
      text += previewFooter(theme, "Syntax highlighting skipped for large diff");
    return text;
  };
  return skipSyntaxHighlight
    ? new FullWidthDiffText(footer(renderPlainDiff(diff, theme, limit)), theme)
    : createProgressiveSyntaxHighlightedDiffText(diff, lang, theme, limit, {
        decorate: footer,
        invalidate,
      });
}

function getEditPreviewOperations(args: unknown): Array<{ oldText: string; newText: string }> {
  const edits = getObjectValue(args, "edits");
  if (Array.isArray(edits)) {
    return edits.flatMap((edit) => {
      const oldText = getObjectValue(edit, "oldText") ?? getObjectValue(edit, "old_text");
      const newText = getObjectValue(edit, "newText") ?? getObjectValue(edit, "new_text");
      return typeof oldText === "string" && typeof newText === "string" && oldText !== newText
        ? [{ oldText, newText }]
        : [];
    });
  }
  const oldText = getObjectValue(args, "oldText") ?? getObjectValue(args, "old_text");
  const newText = getObjectValue(args, "newText") ?? getObjectValue(args, "new_text");
  return typeof oldText === "string" && typeof newText === "string" && oldText !== newText
    ? [{ oldText, newText }]
    : [];
}

function editOperationsSource(operations: Array<{ oldText: string; newText: string }>): string {
  return operations.map((operation) => `${operation.oldText}\0${operation.newText}`).join("\0\0");
}

function renderEditCallPreview(
  operations: Array<{ oldText: string; newText: string }>,
  path: string,
  expanded: boolean,
  theme: Theme,
  invalidate?: () => void,
): FullWidthDiffText {
  const lang = resolvePreviewLanguage({ path, piLanguage: getLanguageFromPath(path) });
  const maxOperations = Math.min(operations.length, 3);
  const perOperationLimit =
    operations.length > 1
      ? Math.max(
          8,
          Math.floor(
            (typeof codePreviewSettings.editCollapsedLines === "number"
              ? codePreviewSettings.editCollapsedLines
              : 160) / maxOperations,
          ),
        )
      : undefined;
  const sections: string[] = [];
  const diffs = operations.map((operation) =>
    createSimpleDiff(operation.oldText, operation.newText),
  );
  const summaries = diffs.map((diff) => summarizeDiff(diff));
  const totalAdditions = summaries.reduce((total, summary) => total + summary.additions, 0);
  const totalRemovals = summaries.reduce((total, summary) => total + summary.removals, 0);
  const totalLines = summaries.reduce((total, summary) => total + summary.totalLines, 0);

  for (let index = 0; index < maxOperations; index++) {
    const diff = diffs[index]!;
    const summary = summaries[index]!;
    const limit =
      expanded || codePreviewSettings.editCollapsedLines === "all"
        ? summary.totalLines
        : (perOperationLimit ?? codePreviewSettings.editCollapsedLines);
    const skipSyntaxHighlight = shouldSkipHighlight(diff);
    let rendered = skipSyntaxHighlight
      ? renderPlainDiff(diff, theme, limit)
      : renderSyntaxHighlightedDiff(diff, lang, theme, limit, invalidate);
    if (summary.totalLines > limit)
      rendered += showingFooter(theme, limit, summary.totalLines, "proposed diff lines");
    if (skipSyntaxHighlight)
      rendered += previewFooter(theme, "Syntax highlighting skipped for large proposed diff");
    if (operations.length > 1)
      sections.push(theme.fg("muted", `Proposed edit ${index + 1}/${operations.length}`));
    sections.push(rendered);
  }

  const remainder = operations.length - maxOperations;
  const header = `${theme.fg("muted", "proposed edit")} ${theme.fg("success", `+${totalAdditions}`)} ${theme.fg("error", `-${totalRemovals}`)}${operations.length > 1 ? theme.fg("muted", ` · ${operations.length} edit blocks`) : ""}`;
  let text = `${header}\n${sections.join("\n")}`;
  if (remainder > 0) text += showingFooter(theme, maxOperations, operations.length, "edit blocks");
  else if (
    !expanded &&
    operations.length === 1 &&
    totalLines >
      (typeof codePreviewSettings.editCollapsedLines === "number"
        ? codePreviewSettings.editCollapsedLines
        : totalLines)
  ) {
    text += ` (${themedKeyHint(theme, "app.tools.expand", "expand")})`;
  }
  return new FullWidthDiffText(text, theme);
}

class HeaderAndBody implements Component {
  constructor(
    private readonly header: Component,
    private readonly body: Component,
  ) {}

  render(width: number): string[] {
    return [...this.header.render(width), ...this.body.render(width)];
  }

  invalidate(): void {
    this.header.invalidate();
    this.body.invalidate();
  }
}

function formatEditHeader(path: string, cwd: string, theme: Theme, summaryText: unknown): string {
  const base = `${theme.fg("toolTitle", theme.bold("edit"))} ${renderDisplayPath(path, cwd, theme)}`;
  return typeof summaryText === "string" && summaryText
    ? `${base}${diffSummarySeparator(theme)}${summaryText}`
    : base;
}

function updateEditHeader(
  context: { args: unknown; state: Record<string, unknown> },
  cwd: string,
  theme: Theme,
): void {
  const text = context.state.editHeaderText;
  if (text instanceof Text)
    text.setText(
      formatEditHeader(getPathArg(context.args), cwd, theme, context.state.editSummaryText),
    );
}

function formatEditSummary(summary: DiffSummary, limit: number, theme: Theme): string {
  let text = theme.fg("muted", countLabel(summary.hunks, "hunk"));
  text +=
    diffSummarySeparator(theme) +
    `${theme.fg("success", `+${summary.additions}`)} ${theme.fg("error", `-${summary.removals}`)}`;
  if (summary.totalLines > limit)
    text +=
      diffSummarySeparator(theme) +
      theme.fg("muted", `showing ${limit}/${summary.totalLines} diff lines`);
  return text;
}
