import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createLsToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { getTextContent } from "../data.ts";
import { showingFooter, trimSingleTrailingNewline } from "../format.ts";
import { renderPathListLines } from "../path-list-rendering.ts";
import { renderDisplayPath } from "../paths.ts";
import { codePreviewSettings } from "../settings.ts";
import { escapeControlChars } from "../terminal-text.ts";
import { renderSelectedOutputLines } from "./common.ts";

export function registerLs(pi: ExtensionAPI, cwd: string) {
  const originalLs = createLsToolDefinition(cwd);
  pi.registerTool({
    ...originalLs,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return originalLs.execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderCall(args, theme) {
      const path = typeof args.path === "string" && args.path ? args.path : ".";
      return new Text(
        `${theme.fg("toolTitle", theme.bold("ls"))} ${renderDisplayPath(path, cwd, theme)}`,
        0,
        0,
      );
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      if (isPartial) return new Text(theme.fg("warning", "Listing…"), 0, 0);
      const output = trimSingleTrailingNewline(getTextContent(result.content));
      if (context.isError)
        return new Text(
          theme.fg("error", escapeControlChars(output.split("\n")[0] || "List failed")),
          0,
          0,
        );
      if (!codePreviewSettings.lsResultPreview) return new Text("", 0, 0);
      if (!output || output === "(empty directory)")
        return new Text(theme.fg("muted", "Empty directory"), 0, 0);
      const rawLines = output.split("\n");
      const limit = expanded ? rawLines.length : codePreviewSettings.pathListCollapsedLines;
      const preview = renderSelectedOutputLines(rawLines, limit, theme, (chunk) =>
        renderPathListLines(chunk.join("\n"), cwd, theme),
      );
      let text = preview.lines.join("\n");
      if (preview.hidden > 0)
        text += showingFooter(theme, preview.shown, rawLines.length, "entries");
      return new Text(text, 0, 0);
    },
  });
}
