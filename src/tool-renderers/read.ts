import type { ExtensionAPI, ReadToolOptions } from "@earendil-works/pi-coding-agent";
import { createReadToolDefinition, getLanguageFromPath } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { getPathArg, getReadStartLine, getTextContent, isTruncated } from "../tool-data";
import { metadata, previewFooter } from "../preview/format";
import { resolvePreviewLanguage } from "../syntax/language";
import { renderDisplayPath } from "../paths/display";
import { codePreviewSettings } from "../settings/index";
import { normalizeShikiLanguage } from "../syntax/shiki";
import { escapeControlChars } from "../shared/terminal-text";
import { renderContentPreview } from "./shared/content-preview";
import { renderHiddenPreviewPrelude, renderResultPrelude } from "./shared/result-prelude";
import { createCodePreviewToolShell } from "../preview/tool-shell";

export function registerRead(pi: ExtensionAPI, cwd: string, options?: ReadToolOptions) {
  const originalRead = createReadToolDefinition(cwd, options);
  const previewShell = createCodePreviewToolShell();

  pi.registerTool({
    ...originalRead,
    renderShell: previewShell.renderShell,

    renderCall(args, theme, context) {
      return previewShell.renderCall(context, theme, () => {
        const path = getPathArg(args);
        const lang = resolvePreviewLanguage({ path, piLanguage: getLanguageFromPath(path) });
        let text = `${theme.fg("toolTitle", theme.bold("read"))} ${renderDisplayPath(path, cwd, theme)}`;
        if (typeof args.offset === "number" || typeof args.limit === "number") {
          const start = typeof args.offset === "number" ? args.offset : 1;
          const end = typeof args.limit === "number" ? start + args.limit - 1 : undefined;
          text += theme.fg("warning", `:${start}${end ? `-${end}` : ""}`);
        }
        text += metadata(theme, [lang ? normalizeShikiLanguage(lang) : undefined]);
        return new Text(text, 0, 0);
      });
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      return previewShell.renderResult(context, theme, (renderContext) => {
        const firstText = getTextContent(result.content);
        const prelude = renderResultPrelude({
          isPartial,
          theme,
          loadingLabel: "Reading…",
          isError: renderContext.isError,
          errorText: firstText.split("\n")[0] || "Read failed",
        });
        if (prelude) return prelude;

        const path = getPathArg(renderContext.args);

        // Pi already renders image content parts natively. Avoid emitting terminal image
        // escape sequences here; show only a compact note beside Pi's image renderer.
        if (result.content?.some((part) => part.type === "image")) {
          return new Text(
            theme.fg("dim", escapeControlChars(firstText.replace(/^Read image file/i, "image"))),
            0,
            0,
          );
        }

        const hiddenPrelude = renderHiddenPreviewPrelude({
          expanded,
          state: renderContext.state,
          theme,
          hidePreview: !codePreviewSettings.readContentPreview,
        });
        if (hiddenPrelude) return hiddenPrelude;

        const lang = resolvePreviewLanguage({
          path,
          content: firstText,
          piLanguage: getLanguageFromPath(path),
        });
        const preview = renderContentPreview({
          content: firstText,
          limit: expanded ? 0 : codePreviewSettings.readCollapsedLines,
          lang,
          theme,
          invalidate: renderContext.invalidate,
          lineNumbers: codePreviewSettings.readLineNumbers
            ? { firstLine: getReadStartLine(renderContext.args) }
            : undefined,
          emptyLabel: "Empty file",
          skipHighlightLabel: "Syntax highlighting skipped for large file",
        });
        let text = preview.text;
        if (isTruncated(result.details)) text += previewFooter(theme, "Output truncated by read");
        return new Text(text, 0, 0);
      });
    },
  });
}
