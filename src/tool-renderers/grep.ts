import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createGrepToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { getTextContent } from "../tool-data";
import {
  metadata,
  previewFooter,
  showingFooter,
  trimSingleTrailingNewline,
} from "../preview/format";
import { renderGrepOutputLines } from "../grep/render";
import { renderDisplayPath } from "../paths/display";
import { codePreviewSettings } from "../settings/index";
import { shouldSkipHighlight } from "../syntax/shiki";
import { escapeControlChars } from "../preview/terminal-text";
import { renderSelectedOutputLines } from "./shared/preview-text";
import { createCodePreviewToolShell, renderHiddenPreviewExpandHint } from "../preview/tool-shell";

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
        if (isPartial) return new Text(theme.fg("warning", "Searching…"), 0, 0);
        const output = trimSingleTrailingNewline(getTextContent(result.content));
        if (renderContext.isError) {
          return new Text(
            theme.fg("error", escapeControlChars(output.split("\n")[0] || "Grep failed")),
            0,
            0,
          );
        }
        if (!expanded && !codePreviewSettings.grepResultPreview)
          return renderHiddenPreviewExpandHint(renderContext.state, theme);
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
