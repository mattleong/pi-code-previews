import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { createWriteToolDefinition, getLanguageFromPath } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { AsyncPreview, shouldRenderAsync } from "../async-preview.ts";
import { getObjectValue, getPathArg, getTextContent } from "../data.ts";
import {
  createProgressiveSyntaxHighlightedDiffText,
  FullWidthDiffText,
  renderPlainDiff,
  summarizeDiff,
} from "../diff.ts";
import { countLabel, formatBytes, metadata, previewFooter, showingFooter } from "../format.ts";
import { resolvePreviewLanguage } from "../language.ts";
import { renderDisplayPath } from "../paths.ts";
import { codePreviewSettings } from "../settings.ts";
import { normalizeShikiLanguage, shouldSkipHighlight } from "../shiki.ts";
import { escapeControlChars } from "../terminal-text.ts";
import {
  createSimpleDiff,
  getWriteDiffSkipReason,
  readExistingFileForPreview,
  shouldSkipWriteDiffBytes,
} from "../write-diff.ts";
import {
  cachedPreview,
  countFileLines,
  previewCacheKey,
  renderHighlightedPreviewText,
  withSecretWarning,
} from "./common.ts";

export function registerWrite(pi: ExtensionAPI, cwd: string) {
  const originalWrite = createWriteToolDefinition(cwd);

  pi.registerTool({
    ...originalWrite,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const path = getPathArg(params);
      const content = typeof params.content === "string" ? params.content : "";
      const before = path ? await readExistingFileForPreview(path, cwd, content) : undefined;
      const result = await originalWrite.execute(toolCallId, params, signal, onUpdate, ctx);
      const details = result.details && typeof result.details === "object" ? result.details : {};
      return { ...result, details: { ...details, codePreviewBeforeWrite: before } };
    },

    renderCall(args, theme, context) {
      const path = getPathArg(args);
      const content = typeof args.content === "string" ? args.content : "";
      const lang = resolvePreviewLanguage({ path, content, piLanguage: getLanguageFromPath(path) });
      const limit = context.expanded ? 0 : codePreviewSettings.writeCollapsedLines;
      const skipHighlight = shouldSkipHighlight(content);
      const preview = renderHighlightedPreviewText(
        content,
        limit,
        skipHighlight ? undefined : lang,
        theme,
        context.invalidate,
      );

      let text = `${theme.fg("toolTitle", theme.bold("write"))} ${renderDisplayPath(path, cwd, theme)}`;
      text += metadata(theme, [
        formatBytes(Buffer.byteLength(content, "utf8")),
        countLabel(preview.total, "line"),
        lang ? normalizeShikiLanguage(lang) : undefined,
      ]);
      const contentPreview = preview.lines.length
        ? withSecretWarning(content, theme, preview.lines.join("\n"))
        : theme.fg("muted", "Empty content");
      text += `\n${contentPreview}`;
      if (preview.hidden > 0) text += showingFooter(theme, preview.shown, preview.total, "lines");
      if (skipHighlight)
        text += previewFooter(theme, "Syntax highlighting skipped for large content");
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, context) {
      const firstText = getTextContent(result.content);
      if (context.isError)
        return new Text(theme.fg("error", escapeControlChars(firstText || "Write failed")), 0, 0);

      const path = getPathArg(context.args);
      const content = typeof context.args?.content === "string" ? context.args.content : "";
      const before = getObjectValue(result.details, "codePreviewBeforeWrite");
      const beforeContent = getObjectValue(before, "content");
      const skipReason = getWriteDiffSkipReason(before, content);
      if (skipReason)
        return new Text(
          theme.fg("success", "✓ Write applied") +
            theme.fg("muted", ` · diff skipped: ${skipReason}`),
          0,
          0,
        );
      if (typeof beforeContent === "string" && beforeContent !== content) {
        if (shouldSkipWriteDiffBytes(beforeContent, content)) {
          return new Text(
            theme.fg("success", "✓ Write applied") +
              theme.fg("muted", " · diff skipped for large content"),
            0,
            0,
          );
        }
        const render = () =>
          renderWriteDiffPreview(beforeContent, content, path, expanded, theme, context.invalidate);
        const source = `${beforeContent}\0${content}`;
        const previewKey = previewCacheKey("write-result", source, path, expanded, theme);
        return cachedPreview(
          context.state,
          "writeResultPreviewKey",
          "writeResultPreviewComponent",
          previewKey,
          () =>
            shouldRenderAsync(source)
              ? new AsyncPreview("Rendering write diff…", theme, render, context.invalidate)
              : render(),
        );
      }
      if (typeof beforeContent === "string")
        return new Text(theme.fg("muted", "✓ Write applied · no changes"), 0, 0);
      return new Text(
        theme.fg("success", `✓ New file (${countLabel(countFileLines(content), "line")})`),
        0,
        0,
      );
    },
  });
}

function renderWriteDiffPreview(
  before: string,
  content: string,
  path: string,
  expanded: boolean,
  theme: Theme,
  invalidate?: () => void,
): FullWidthDiffText {
  if (shouldSkipWriteDiffBytes(before, content)) {
    return new FullWidthDiffText(
      theme.fg("success", "✓ Write applied") +
        theme.fg("muted", " · diff skipped for large content"),
      theme,
    );
  }
  const diff = createSimpleDiff(before, content);
  const lang = resolvePreviewLanguage({ path, content, piLanguage: getLanguageFromPath(path) });
  const summary = summarizeDiff(diff);
  const limit =
    expanded || codePreviewSettings.editCollapsedLines === "all"
      ? summary.totalLines
      : codePreviewSettings.editCollapsedLines;
  const header = `${theme.fg("success", "✓ Write applied")} ${theme.fg("muted", describeEditShape(summary))}${editSummarySeparator(theme)}${theme.fg("success", `+${summary.additions}`)} ${theme.fg("error", `-${summary.removals}`)}\n`;
  const skipSyntaxHighlight = shouldSkipHighlight(diff);
  const decorate = (body: string) => {
    let text = header + body;
    if (summary.totalLines > limit)
      text += showingFooter(theme, limit, summary.totalLines, "diff lines");
    if (skipSyntaxHighlight)
      text += previewFooter(theme, "Syntax highlighting skipped for large diff");
    return text;
  };
  return skipSyntaxHighlight
    ? new FullWidthDiffText(decorate(renderPlainDiff(diff, theme, limit)), theme)
    : createProgressiveSyntaxHighlightedDiffText(diff, lang, theme, limit, {
        decorate,
        invalidate,
      });
}

function editSummarySeparator(theme: Theme): string {
  return theme.fg("muted", " · ");
}

function describeEditShape(summary: ReturnType<typeof summarizeDiff>): string {
  const parts: string[] = [];
  if (summary.replacements > 0) parts.push(countLabel(summary.replacements, "replacement"));
  if (summary.insertions > 0) parts.push(countLabel(summary.insertions, "insertion"));
  if (summary.deletions > 0) parts.push(countLabel(summary.deletions, "deletion"));
  return parts.length ? parts.join(", ") : "changes";
}
