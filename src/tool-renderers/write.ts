import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { createWriteToolDefinition, getLanguageFromPath } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { AsyncPreview, shouldRenderAsync } from "../preview/async";
import { getPathArg, getTextContent } from "../tool-data";
import { FullWidthDiffText } from "../diff/index";
import { createSimpleDiff } from "../diff/structured";
import { describeDiffShape, diffSummarySeparator, summarizeDiff } from "../diff/summary";
import { countContentLines } from "../preview/line-counts";
import { countLabel, formatBytes } from "../shared/format";
import { metadata, previewFooter, showingFooter } from "../preview/format";
import { resolvePreviewLanguage } from "../syntax/language";
import { renderDisplayPath } from "../paths/display";
import { codePreviewSettings } from "../settings/index";
import { getShikiStatus, normalizeShikiLanguage, shouldSkipHighlight } from "../syntax/shiki";
import { escapeControlChars } from "../shared/terminal-text";
import {
  getWriteDiffSkipReason,
  readExistingFileForPreview,
  resolvePreviewPath,
  shouldSkipWriteDiffBytes,
} from "../write/diff";
import { runSerializedWritePreview } from "../write/preview-queue";
import { getObjectValue } from "../shared/objects";
import { createDiffPreviewText, diffPreviewLineLimit } from "./shared/diff-preview";
import { cachedPreview, previewCacheKey } from "./shared/cache";
import { renderHighlightedPreviewText } from "./shared/preview-text";
import { withSecretWarning } from "./shared/secret-preview";
import { createCodePreviewToolShell, hiddenPreviewExpandHintForShell } from "../preview/tool-shell";

export function registerWrite(pi: ExtensionAPI, cwd: string) {
  const originalWrite = createWriteToolDefinition(cwd);
  const previewShell = createCodePreviewToolShell();

  pi.registerTool({
    ...originalWrite,
    renderShell: previewShell.renderShell,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const path = getPathArg(params);
      const content = typeof params.content === "string" ? params.content : "";
      return runSerializedWritePreview(
        path ? resolvePreviewPath(path, cwd) : undefined,
        async () => {
          const before = path ? await readExistingFileForPreview(path, cwd, content) : undefined;
          const result = await originalWrite.execute(toolCallId, params, signal, onUpdate, ctx);
          const details =
            result.details && typeof result.details === "object" ? result.details : {};
          return { ...result, details: { ...details, codePreviewBeforeWrite: before } };
        },
      );
    },

    renderCall(args, theme, context) {
      return previewShell.renderCall(context, theme, (renderContext) => {
        if (!renderContext) throw new TypeError("Code preview render context is required.");
        const path = getPathArg(args);
        const content = typeof args.content === "string" ? args.content : "";
        const lang = resolvePreviewLanguage({
          path,
          content,
          piLanguage: getLanguageFromPath(path),
        });
        if (!renderContext.expanded && !codePreviewSettings.writeContentPreview)
          return new Text(
            `${formatWriteCallHeader(
              content,
              path,
              cwd,
              theme,
              lang,
              countContentLines(content),
            )}${formatOptionalHiddenHint(
              hiddenPreviewExpandHintForShell(renderContext.state, theme),
            )}`,
            0,
            0,
          );
        const previewKey = `${previewCacheKey(
          "write-call",
          content,
          path,
          renderContext.expanded,
          theme,
        )}\0${writeCallPreviewSettingsKey()}`;
        return cachedPreview(
          renderContext.state,
          "writeCallPreviewKey",
          "writeCallPreviewComponent",
          previewKey,
          () =>
            renderWriteCallPreview(
              content,
              path,
              cwd,
              renderContext.expanded,
              theme,
              renderContext.invalidate,
            ),
        );
      });
    },

    renderResult(result, { expanded }, theme, context) {
      return previewShell.renderResult(context, theme, (renderContext) => {
        const firstText = getTextContent(result.content);
        if (renderContext.isError)
          return new Text(theme.fg("error", escapeControlChars(firstText || "Write failed")), 0, 0);

        const path = getPathArg(renderContext.args);
        const content =
          typeof renderContext.args?.content === "string" ? renderContext.args.content : "";
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
          if (!expanded && !codePreviewSettings.writeContentPreview)
            return new Text(
              `${theme.fg("success", "✓ Write applied")}${formatOptionalHiddenHint(
                hiddenPreviewExpandHintForShell(renderContext.state, theme),
              )}`,
              0,
              0,
            );
          if (shouldSkipWriteDiffBytes(beforeContent, content)) {
            return new Text(
              theme.fg("success", "✓ Write applied") +
                theme.fg("muted", " · diff skipped for large content"),
              0,
              0,
            );
          }
          const render = () =>
            renderWriteDiffPreview(
              beforeContent,
              content,
              path,
              expanded,
              theme,
              renderContext.invalidate,
            );
          const source = `${beforeContent}\0${content}`;
          const previewKey = previewCacheKey("write-result", source, path, expanded, theme);
          return cachedPreview(
            renderContext.state,
            "writeResultPreviewKey",
            "writeResultPreviewComponent",
            previewKey,
            () =>
              shouldRenderAsync(source)
                ? new AsyncPreview("Rendering write diff…", theme, render, renderContext.invalidate)
                : render(),
          );
        }
        if (typeof beforeContent === "string")
          return new Text(theme.fg("muted", "✓ Write applied · no changes"), 0, 0);
        return new Text(
          theme.fg("success", `✓ New file (${countLabel(countContentLines(content), "line")})`),
          0,
          0,
        );
      });
    },
  });
}

function formatOptionalHiddenHint(hint: string): string {
  return hint ? `\n${hint}` : "";
}

function writeCallPreviewSettingsKey(): string {
  const shikiStatus = getShikiStatus();
  return [
    String(codePreviewSettings.writeCollapsedLines),
    codePreviewSettings.writeContentPreview ? "write-preview" : "no-write-preview",
    codePreviewSettings.secretWarnings ? "secret-warnings" : "no-secret-warnings",
    shikiStatus.initialized ? "shiki-ready" : "shiki-loading",
    String(shikiStatus.loadedLanguages),
    String(shikiStatus.pendingLanguages),
    String(shikiStatus.statusVersion),
  ].join("\0");
}

function renderWriteCallPreview(
  content: string,
  path: string,
  cwd: string,
  expanded: boolean,
  theme: Theme,
  invalidate?: () => void,
): Text {
  const lang = resolvePreviewLanguage({
    path,
    content,
    piLanguage: getLanguageFromPath(path),
  });
  const limit = expanded ? 0 : codePreviewSettings.writeCollapsedLines;
  const skipHighlight = shouldSkipHighlight(content);
  const preview = renderHighlightedPreviewText(
    content,
    limit,
    skipHighlight ? undefined : lang,
    theme,
    invalidate,
  );

  let text = formatWriteCallHeader(content, path, cwd, theme, lang, preview.total);
  const contentPreview = preview.lines.length
    ? withSecretWarning(content, theme, preview.lines.join("\n"))
    : theme.fg("muted", "Empty content");
  text += `\n${contentPreview}`;
  if (preview.hidden > 0) text += showingFooter(theme, preview.shown, preview.total, "lines");
  if (skipHighlight) text += previewFooter(theme, "Syntax highlighting skipped for large content");
  return new Text(text, 0, 0);
}

function formatWriteCallHeader(
  content: string,
  path: string,
  cwd: string,
  theme: Theme,
  lang: string | undefined,
  lineCount: number,
): string {
  let text = `${theme.fg("toolTitle", theme.bold("write"))} ${renderDisplayPath(path, cwd, theme)}`;
  text += metadata(theme, [
    formatBytes(Buffer.byteLength(content, "utf8")),
    countLabel(lineCount, "line"),
    lang ? normalizeShikiLanguage(lang) : undefined,
  ]);
  return text;
}

function renderWriteDiffPreview(
  before: string,
  content: string,
  path: string,
  expanded: boolean,
  theme: Theme,
  invalidate?: () => void,
): FullWidthDiffText {
  const diff = createSimpleDiff(before, content);
  const lang = resolvePreviewLanguage({ path, content, piLanguage: getLanguageFromPath(path) });
  const summary = summarizeDiff(diff);
  const limit = diffPreviewLineLimit(
    summary.totalLines,
    expanded,
    codePreviewSettings.editCollapsedLines,
  );
  const header = `${theme.fg("success", "✓ Write applied")} ${theme.fg("muted", describeDiffShape(summary))}${diffSummarySeparator(theme)}${theme.fg("success", `+${summary.additions}`)} ${theme.fg("error", `-${summary.removals}`)}\n`;
  return createDiffPreviewText(diff, lang, theme, limit, {
    totalLines: summary.totalLines,
    hiddenLineNoun: "diff lines",
    skipHighlightLabel: "Syntax highlighting skipped for large diff",
    decorate: (body) => header + body,
    invalidate,
  });
}
