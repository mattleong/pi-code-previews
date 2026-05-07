import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createFindToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { getTextContent } from "../data.ts";
import { hiddenPreviewExpandHint, showingFooter, trimSingleTrailingNewline } from "../format.ts";
import { renderPathListLines } from "../path-list-rendering.ts";
import { renderDisplayPath } from "../paths.ts";
import { codePreviewSettings } from "../settings.ts";
import { escapeControlChars } from "../terminal-text.ts";
import { renderSelectedOutputLines } from "./common.ts";

export function registerFind(pi: ExtensionAPI, cwd: string) {
  const originalFind = createFindToolDefinition(cwd);
  pi.registerTool({
    ...originalFind,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return originalFind.execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderCall(args, theme) {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      const path = typeof args.path === "string" && args.path ? args.path : ".";
      return new Text(
        `${theme.fg("toolTitle", theme.bold("find"))} ${theme.fg("accent", escapeControlChars(pattern || "*"))} ${theme.fg("muted", "in")} ${renderDisplayPath(path, cwd, theme)}`,
        0,
        0,
      );
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      if (isPartial) return new Text(theme.fg("warning", "Finding…"), 0, 0);
      const output = trimSingleTrailingNewline(getTextContent(result.content));
      if (context.isError)
        return new Text(
          theme.fg("error", escapeControlChars(output.split("\n")[0] || "Find failed")),
          0,
          0,
        );
      if (!expanded && !codePreviewSettings.findResultPreview)
        return new Text(hiddenPreviewExpandHint(theme), 0, 0);
      if (!output || output === "No files found matching pattern")
        return new Text(theme.fg("muted", output || "No files found"), 0, 0);
      if (expanded && !codePreviewSettings.findResultPreview)
        return new Text(
          output
            .split("\n")
            .map((line) => theme.fg("toolOutput", escapeControlChars(line)))
            .join("\n"),
          0,
          0,
        );
      const rawLines = output.split("\n");
      const limit = expanded ? rawLines.length : codePreviewSettings.pathListCollapsedLines;
      const preview = renderSelectedOutputLines(rawLines, limit, theme, (chunk) =>
        renderPathListLines(chunk.join("\n"), cwd, theme),
      );
      let text = preview.lines.join("\n");
      if (preview.hidden > 0) text += showingFooter(theme, preview.shown, rawLines.length, "paths");
      return new Text(text, 0, 0);
    },
  });
}
