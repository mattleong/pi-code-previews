import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { createWriteToolDefinition, getLanguageFromPath } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  createSimpleDiff,
  describeDiffShape,
  diffSummarySeparator,
  FullWidthDiffText,
  summarizeDiff,
} from "../diff";
import { renderDisplayPath } from "../paths/display";
import { metadata } from "../preview/format";
import { countContentLines } from "../preview/line-counts";
import { createCodePreviewToolShell, hiddenPreviewExpandHintForShell } from "../preview/tool-shell";
import { codePreviewSettings } from "../settings/index";
import { countLabel, formatBytes } from "../shared/format";
import { getObjectValue } from "../shared/objects";
import { escapeControlChars } from "../shared/terminal-text";
import { resolvePreviewLanguage } from "../syntax/language";
import { normalizeShikiLanguage } from "../syntax/shiki";
import { getPathArg } from "../tool-data/args";
import { getTextContent } from "../tool-data/results";
import {
  getWriteDiffSkipReason,
  readExistingFileForPreview,
  shouldSkipWriteDiffBytes,
} from "../write/diff";
import {
  executeWriteWithPreview,
  getCodePreviewBeforeWrite,
  withCodePreviewBeforeWrite,
} from "../write/preview-execution";
import { cachedAsyncPreview, cachedPreview } from "./shared/cache";
import { diffPreviewCacheKey, writeCallPreviewCacheKey } from "./shared/preview-cache-key";
import { renderContentPreview } from "./shared/content-preview";
import { createDiffPreviewText, diffPreviewLineLimit } from "./shared/diff-preview";

export function registerWrite(pi: ExtensionAPI, cwd: string) {
  const originalWrite = createWriteToolDefinition(cwd);
  const previewShell = createCodePreviewToolShell();

  pi.registerTool({
    ...originalWrite,
    renderShell: previewShell.renderShell,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const path = getPathArg(params);
      const content = getObjectValue(params, "content");
      if (!path || typeof content !== "string") {
        const before = path ? await readExistingFileForPreview(path, cwd, "") : undefined;
        const result = await originalWrite.execute(toolCallId, params, signal, onUpdate, ctx);
        return withCodePreviewBeforeWrite(result, before);
      }
      return executeWriteWithPreview(path, content, cwd, signal);
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
        const previewKey = writeCallPreviewCacheKey(content, path, renderContext.expanded, theme);
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
              lang,
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
        const before = getCodePreviewBeforeWrite(result.details);
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
          const previewKey = diffPreviewCacheKey("write-result", source, path, expanded, theme);
          return cachedAsyncPreview(
            renderContext.state,
            "writeResultPreviewKey",
            "writeResultPreviewComponent",
            previewKey,
            source,
            "Rendering write diff…",
            theme,
            render,
            renderContext.invalidate,
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

function renderWriteCallPreview(
  content: string,
  path: string,
  cwd: string,
  expanded: boolean,
  theme: Theme,
  lang: string | undefined,
  invalidate?: () => void,
): Text {
  const preview = renderContentPreview({
    content,
    limit: expanded ? 0 : codePreviewSettings.writeCollapsedLines,
    lang,
    theme,
    invalidate,
    emptyLabel: "Empty content",
    skipHighlightLabel: "Syntax highlighting skipped for large content",
  });
  return new Text(
    `${formatWriteCallHeader(content, path, cwd, theme, lang, preview.total)}\n${preview.text}`,
    0,
    0,
  );
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
