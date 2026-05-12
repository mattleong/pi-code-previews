import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createGrepToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { renderGrepOutputLines } from "../grep/render";
import { renderDisplayPath } from "../paths/display";
import {
  metadata,
  previewFooter,
  showingFooter,
  trimSingleTrailingNewline,
} from "../preview/format";
import { createCodePreviewToolShell } from "../preview/tool-shell";
import { codePreviewSettings } from "../settings/index";
import { escapeControlChars } from "../shared/terminal-text";
import { shouldSkipHighlight } from "../syntax/shiki";
import { getTextContent } from "../tool-data/results";
import { renderSelectedOutputLines } from "./shared/preview-text";
import { renderHiddenPreviewPrelude, renderResultPrelude } from "./shared/result-prelude";

export function registerGrep(pi: ExtensionAPI, cwd: string) {
  const originalGrep = createGrepToolDefinition(cwd);
  const previewShell = createCodePreviewToolShell();

  pi.registerTool({
    ...originalGrep,
    renderShell: previewShell.renderShell,

    renderCall(args, theme, context) {
      return previewShell.renderCall(context, theme, () => {
        const pattern = typeof args.pattern === "string" ? args.pattern : "";
        const path = typeof args.path === "string" && args.path ? args.path : ".";
        const glob = typeof args.glob === "string" && args.glob ? args.glob : undefined;
        const limit = typeof args.limit === "number" ? args.limit : undefined;
        let text = `${theme.fg("toolTitle", theme.bold("grep"))} ${theme.fg("accent", `/${escapeControlChars(pattern)}/`)} ${theme.fg("muted", "in")} ${renderDisplayPath(path, cwd, theme)}`;
        text += metadata(theme, [
          glob ? escapeControlChars(glob) : undefined,
          limit ? `limit ${limit}` : undefined,
        ]);
        return new Text(text, 0, 0);
      });
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      return previewShell.renderResult(context, theme, (renderContext) => {
        const output = trimSingleTrailingNewline(getTextContent(result.content));
        const prelude = renderResultPrelude({
          isPartial,
          theme,
          loadingLabel: "Searching…",
          isError: renderContext.isError,
          errorText: output.split("\n")[0] || "Grep failed",
        });
        if (prelude) return prelude;
        const hiddenPrelude = renderHiddenPreviewPrelude({
          expanded,
          state: renderContext.state,
          theme,
          hidePreview: !codePreviewSettings.grepResultPreview,
        });
        if (hiddenPrelude) return hiddenPrelude;
        if (!output || output === "No matches found")
          return new Text(theme.fg("muted", output || "No matches found"), 0, 0);

        const pattern =
          typeof renderContext.args?.pattern === "string" ? renderContext.args.pattern : "";
        const rawLines = output.split("\n");
        const limit = expanded ? rawLines.length : codePreviewSettings.grepCollapsedLines;
        const skipHighlight = shouldSkipHighlight(output);
        const preview = renderSelectedOutputLines(rawLines, limit, theme, (chunk) =>
          renderGrepOutputLines(
            chunk.join("\n"),
            theme,
            {
              pattern,
              literal: renderContext.args?.literal === true,
              ignoreCase: renderContext.args?.ignoreCase === true,
            },
            renderContext.invalidate,
            { syntaxHighlight: !skipHighlight },
          ),
        );
        let text = preview.lines.join("\n");
        if (preview.hidden > 0)
          text += showingFooter(theme, preview.shown, rawLines.length, "grep output lines");
        if (skipHighlight)
          text += previewFooter(theme, "Syntax highlighting skipped for large grep output");
        return new Text(text, 0, 0);
      });
    },
  });
}
