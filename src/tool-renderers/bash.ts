import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { getBashWarnings } from "../bash-warnings.js";
import { getObjectValue, getTextContent, isTruncated } from "../data.js";
import {
  countLabel,
  previewFooter,
  previewLines,
  showingFooter,
  trimSingleTrailingNewline,
} from "../format.js";
import { codePreviewSettings } from "../settings.js";
import { renderHighlightedText } from "../shiki.js";
import { escapeControlChars } from "../terminal-text.js";
import { withSecretWarning } from "./common.js";

export function registerBash(pi: ExtensionAPI, cwd: string) {
  const originalBash = createBashToolDefinition(cwd);

  pi.registerTool({
    ...originalBash,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return originalBash.execute(toolCallId, params, signal, onUpdate, ctx);
    },

    renderCall(args, theme, context) {
      const command = typeof args.command === "string" ? args.command : "";
      const timeout =
        typeof args.timeout === "number" ? theme.fg("muted", ` (timeout ${args.timeout}s)`) : "";
      const highlighted = renderHighlightedText(
        command || "...",
        "bash",
        theme,
        context.invalidate,
      ).join("\n");
      const warnings = codePreviewSettings.bashWarnings ? getBashWarnings(command) : [];
      const warningText = warnings.length
        ? `${theme.fg("warning", `⚠ Preview ${countLabel(warnings.length, "warning")}: ${warnings.join(", ")}`)}\n`
        : "";
      return new Text(
        `${warningText}${theme.fg("toolTitle", theme.bold("$"))} ${highlighted}${timeout}`,
        0,
        0,
      );
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      if (isPartial) return new Text(theme.fg("warning", "Running…"), 0, 0);
      const output = trimSingleTrailingNewline(getTextContent(result.content));
      const lines = output
        ? output
            .split("\n")
            .map((line) =>
              theme.fg(context.isError ? "error" : "toolOutput", escapeControlChars(line)),
            )
        : [];
      const limit = expanded ? lines.length : 8;
      const preview = previewLines(lines, limit, theme);
      let text = preview.lines.length
        ? withSecretWarning(output, theme, preview.lines.join("\n"))
        : theme.fg("muted", "No output");
      if (preview.hidden > 0)
        text += showingFooter(theme, preview.shown, lines.length, "output lines");
      if (isTruncated(result.details)) text += previewFooter(theme, "Output truncated by bash");
      const fullOutputPath = getObjectValue(result.details, "fullOutputPath");
      if (typeof fullOutputPath === "string")
        text += previewFooter(theme, `Full output: ${escapeControlChars(fullOutputPath)}`);
      return new Text(text, 0, 0);
    },
  });
}
