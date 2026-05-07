import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { getBashWarnings } from "../bash-warnings.ts";
import { getObjectValue, getTextContent, isTruncated } from "../data.ts";
import {
  countLabel,
  previewFooter,
  previewLines,
  showingFooter,
  trimSingleTrailingNewline,
} from "../format.ts";
import { codePreviewSettings } from "../settings.ts";
import { renderHighlightedText } from "../shiki.ts";
import { escapeControlChars } from "../terminal-text.ts";
import { withSecretWarning } from "./common.ts";

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
      if (!context.isError && shouldHideBashResult(context.args)) return new Text("", 0, 0);
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

function shouldHideBashResult(args: unknown): boolean {
  const command = getObjectValue(args, "command");
  if (typeof command !== "string") return false;
  const shellCommand = getFirstShellCommandName(command);
  if (
    (shellCommand === "grep" || shellCommand === "egrep" || shellCommand === "fgrep") &&
    !codePreviewSettings.grepResultPreview
  )
    return true;
  if (shellCommand === "find" && !codePreviewSettings.findResultPreview) return true;
  if (shellCommand === "ls" && !codePreviewSettings.lsResultPreview) return true;
  return false;
}

function getFirstShellCommandName(command: string): string | undefined {
  const words = getLeadingShellWords(command);
  const commandWord = words.find((word) => !isShellAssignment(word));
  return commandWord?.split("/").pop();
}

function getLeadingShellWords(command: string): string[] {
  const words: string[] = [];
  let index = 0;
  while (index < command.length) {
    while (index < command.length && /\s/.test(command[index]!)) index++;
    if (index >= command.length || isShellOperator(command[index]!)) break;

    let word = "";
    while (index < command.length) {
      const char = command[index]!;
      if (/\s/.test(char) || isShellOperator(char)) break;
      if (char === "'" || char === '"') {
        const quote = char;
        index++;
        while (index < command.length && command[index] !== quote) {
          if (quote === '"' && command[index] === "\\") index++;
          if (index < command.length) word += command[index++]!;
        }
        if (index < command.length) index++;
        continue;
      }
      if (char === "\\") {
        index++;
        if (index < command.length) word += command[index++]!;
        continue;
      }
      word += char;
      index++;
    }
    if (word) words.push(word);
    if (words.length >= 8) break;
  }
  return words;
}

function isShellAssignment(word: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(word);
}

function isShellOperator(char: string): boolean {
  return "|&;()<>{}".includes(char);
}
