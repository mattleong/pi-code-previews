import type { BashToolOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { previewFooter, showingFooter, trimSingleTrailingNewline } from "../preview/format";
import { createCodePreviewToolShell } from "../preview/tool-shell";
import { codePreviewSettings } from "../settings/index";
import { countLabel } from "../shared/format";
import { getObjectValue } from "../shared/objects";
import { escapeControlChars } from "../shared/terminal-text";
import { getFirstShellCommandName } from "../shell/command";
import { renderHighlightedText } from "../syntax/shiki";
import { getTextContent, isTruncated } from "../tool-data/results";
import { shouldHideShellResultByCommand } from "../tools/shell-result-policy";
import { getBashWarnings } from "../warnings/bash";
import { renderSelectedOutputLines } from "./shared/preview-text";
import { renderHiddenPreviewPrelude, renderResultPrelude } from "./shared/result-prelude";
import { withSecretWarning } from "./shared/secret-preview";

function shouldHideBashResult(args: unknown): boolean {
  const command = getObjectValue(args, "command");
  return shouldHideShellResultByCommand(
    typeof command === "string" ? getFirstShellCommandName(command) : undefined,
    codePreviewSettings,
  );
}

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
        const prelude = renderResultPrelude({
          isPartial,
          theme,
          loadingLabel: "Running…",
        });
        if (prelude) return prelude;
        const hiddenPrelude = renderHiddenPreviewPrelude({
          expanded,
          state: renderContext.state,
          theme,
          hidePreview: !renderContext.isError && shouldHideBashResult(renderContext.args),
        });
        if (hiddenPrelude) return hiddenPrelude;
        const output = trimSingleTrailingNewline(getTextContent(result.content));
        const lines = output
          ? output
              .split("\n")
              .map((line) =>
                theme.fg(renderContext.isError ? "error" : "muted", escapeControlChars(line)),
              )
          : [];
        const limit = expanded ? lines.length : 8;
        const preview = renderSelectedOutputLines(lines, limit, theme, (chunk) => chunk);
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
