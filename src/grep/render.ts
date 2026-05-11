import type { Theme } from "@earendil-works/pi-coding-agent";
import { getLanguageFromPath } from "@earendil-works/pi-coding-agent";
import { resolvePreviewLanguage } from "../syntax/language";
import { renderHighlightedText } from "../syntax/shiki";
import { escapeControlChars, injectVisibleRanges } from "../shared/terminal-text";

export type ParsedGrepOutputLine = {
  path: string;
  lineNumber: string;
  code: string;
  kind: "match" | "context";
};

export function renderGrepOutputLines(
  output: string,
  theme: Theme,
  search: { pattern: string; literal: boolean; ignoreCase: boolean },
  invalidate?: () => void,
  options: { syntaxHighlight?: boolean } = {},
): string[] {
  const rendered: string[] = [];
  let currentPath = "";
  for (const rawLine of output.split("\n")) {
    if (!rawLine) {
      rendered.push("");
      continue;
    }
    if (rawLine.startsWith("[") && rawLine.endsWith("]")) {
      rendered.push(theme.fg("warning", escapeControlChars(rawLine)));
      continue;
    }
    const parsed = parseGrepOutputLine(rawLine);
    if (!parsed) {
      rendered.push(theme.fg("toolOutput", escapeControlChars(rawLine)));
      continue;
    }
    if (parsed.path !== currentPath) {
      currentPath = parsed.path;
      rendered.push(theme.fg("accent", escapeControlChars(currentPath)));
    }
    rendered.push(
      renderGrepParsedLine(parsed, theme, search, invalidate, options.syntaxHighlight !== false),
    );
  }
  return rendered;
}

export function parseGrepOutputLine(line: string): ParsedGrepOutputLine | undefined {
  const matchLine = line.match(/^(.+):(\d+):\s(.*)$/);
  if (matchLine) {
    return {
      path: matchLine[1] ?? "",
      lineNumber: matchLine[2] ?? "",
      code: matchLine[3] ?? "",
      kind: "match",
    };
  }
  const contextLine = line.match(/^(.+)-(\d+)-\s(.*)$/);
  if (contextLine) {
    return {
      path: contextLine[1] ?? "",
      lineNumber: contextLine[2] ?? "",
      code: contextLine[3] ?? "",
      kind: "context",
    };
  }
  return undefined;
}

function renderGrepParsedLine(
  parsed: ParsedGrepOutputLine,
  theme: Theme,
  search: { pattern: string; literal: boolean; ignoreCase: boolean },
  invalidate: (() => void) | undefined,
  syntaxHighlight: boolean,
): string {
  const lang = syntaxHighlight
    ? resolvePreviewLanguage({ path: parsed.path, piLanguage: getLanguageFromPath(parsed.path) })
    : undefined;
  const code = parsed.code.replace(/\t/g, "   ");
  let highlighted =
    renderHighlightedText(code, lang, theme, invalidate)[0] ?? theme.fg("toolOutput", code);
  const matchRanges = parsed.kind === "match" ? grepMatchRanges(code, search) : [];
  if (matchRanges.length > 0)
    highlighted = injectVisibleRanges(highlighted, matchRanges, {
      open: "\x1b[48;2;90;74;28m",
      close: getToolBackground(theme) || "\x1b[49m",
      reopenAfterSgr: (sequence) => sequence === "\x1b[39m",
    });
  const paddedLineNumber = parsed.lineNumber.padStart(4);
  const lineNumber =
    parsed.kind === "match"
      ? theme.fg("accent", paddedLineNumber)
      : theme.fg("dim", paddedLineNumber);
  const marker = parsed.kind === "match" ? theme.fg("warning", "│") : theme.fg("dim", "┆");
  return `${theme.fg("dim", "  ")}${lineNumber} ${marker} ${highlighted}`;
}

function grepMatchRanges(
  code: string,
  search: { pattern: string; literal: boolean; ignoreCase: boolean },
): Array<[number, number]> {
  if (!search.pattern || !search.literal) return [];
  const haystack = search.ignoreCase ? code.toLowerCase() : code;
  const needle = search.ignoreCase ? search.pattern.toLowerCase() : search.pattern;
  const ranges: Array<[number, number]> = [];
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    ranges.push([index, index + needle.length]);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return ranges;
}

function getToolBackground(theme: Theme): string {
  const themed = theme as Theme & { getBgAnsi?: (key: string) => string };
  try {
    return themed.getBgAnsi?.("toolSuccessBg") ?? "";
  } catch {
    return "";
  }
}
