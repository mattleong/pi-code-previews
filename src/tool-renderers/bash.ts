import type { BashToolOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { getBashWarnings } from "../warnings/bash";
import { getTextContent, isTruncated } from "../tool-data";
import { getObjectValue } from "../shared/objects";
import {
  countLabel,
  previewFooter,
  previewLines,
  showingFooter,
  trimSingleTrailingNewline,
} from "../preview/format";
import { codePreviewSettings } from "../settings/index";
import { renderHighlightedText } from "../syntax/shiki";
import { escapeControlChars } from "../preview/terminal-text";
import { shouldHideBashResult } from "./shared/bash-preview-policy";
import { withSecretWarning } from "./shared/secret-preview";
import { createCodePreviewToolShell, renderHiddenPreviewExpandHint } from "../preview/tool-shell";

export function registerBash(pi: ExtensionAPI, cwd: string, options?: BashToolOptions) {
  const originalBash = createBashToolDefinition(cwd, options);
  const previewShell = createCodePreviewToolShell();

  pi.registerTool({
    ...originalBash,
    renderShell: previewShell.renderShell,

    renderCall(args, theme, context) {
      return previewShell.renderCall(context, theme, (renderContext) => {
        if (!renderContext) throw new TypeError("Code preview render context is required.");
        const command = typeof args.command === "string" ? args.command : "";
        const timeout =
          typeof args.timeout === "number" ? theme.fg("muted", ` (timeout ${args.timeout}s)`) : "";
        const highlighted = renderHighlightedText(
          command || "...",
          "bash",
          theme,
          renderContext.invalidate,
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
      });
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      return previewShell.renderResult(context, theme, (renderContext) => {
        if (isPartial) return new Text(theme.fg("warning", "Running…"), 0, 0);
        if (!expanded && !renderContext.isError && shouldHideBashResult(renderContext.args))
          return renderHiddenPreviewExpandHint(renderContext.state, theme);
        const output = trimSingleTrailingNewline(getTextContent(result.content));
        const lines = output
          ? output
              .split("\n")
              .map((line) =>
                theme.fg(renderContext.isError ? "error" : "muted", escapeControlChars(line)),
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
      });
    },
  });
}
