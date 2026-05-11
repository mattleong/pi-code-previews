import type { Theme } from "@earendil-works/pi-coding-agent";
import { codePreviewSettings } from "../settings/index";
import { renderWithShiki } from "../syntax/shiki";
import { escapeControlChars } from "../preview/terminal-text";
import { splitLinesLimited } from "../shared/text-lines";
import { FullWidthDiffText } from "./full-width-text";
import { changedLineEmphasis, emphasizeChangedSpans } from "./line-emphasis";
import { DIFF_ADD_MARKER, DIFF_REMOVE_MARKER } from "./markers";
import {
  diffLineNumberWidth,
  formatDiffLineNumber,
  isChangedDiffLine,
  parseDiffLine,
  type ParsedDiffLine,
} from "./parse";

export function renderSyntaxHighlightedDiff(
  diff: string,
  lang: string | undefined,
  theme: Theme,
  limit: number,
  invalidate?: () => void,
): string {
  return renderSyntaxHighlightedDiffWithWordEmphasis(
    diff,
    lang,
    theme,
    limit,
    invalidate,
    codePreviewSettings.wordEmphasis !== "off",
  );
}

export function createProgressiveSyntaxHighlightedDiffText(
  diff: string,
  lang: string | undefined,
  theme: Theme,
  limit: number,
  options: { decorate?: (body: string) => string; invalidate?: () => void } = {},
): FullWidthDiffText {
  const decorate = options.decorate ?? ((body: string) => body);
  const initialBody = renderSyntaxHighlightedDiffWithWordEmphasis(
    diff,
    lang,
    theme,
    limit,
    options.invalidate,
    codePreviewSettings.wordEmphasis !== "off",
  );
  return new FullWidthDiffText(decorate(initialBody), theme);
}

function renderSyntaxHighlightedDiffWithWordEmphasis(
  diff: string,
  lang: string | undefined,
  theme: Theme,
  limit: number,
  invalidate: (() => void) | undefined,
  emphasizeChangedPairs: boolean,
): string {
  return renderDiff(diff, {
    lang,
    theme,
    limit,
    invalidate,
    syntaxHighlight: true,
    emphasizeChangedPairs,
  });
}

export function renderPlainDiff(diff: string, theme: Theme, limit: number): string {
  return renderDiff(diff, {
    theme,
    limit,
    syntaxHighlight: false,
    emphasizeChangedPairs: false,
  });
}

type DiffRenderOptions = {
  lang?: string;
  theme: Theme;
  limit: number;
  invalidate?: () => void;
  syntaxHighlight: boolean;
  emphasizeChangedPairs: boolean;
};

function renderDiff(diff: string, options: DiffRenderOptions): string {
  const lines = splitLinesLimited(diff, options.limit);
  const parsedLines = lines.map(parseDiffLine);
  const lineNumberWidth = diffLineNumberWidth(parsedLines);
  const out: string[] = [];
  const lang = options.syntaxHighlight ? options.lang : undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const parsed = parsedLines[i];
    if (!parsed) {
      out.push(renderSeparator(line, options.theme));
      continue;
    }

    if (options.emphasizeChangedPairs && isChangedDiffLine(parsed)) {
      const block: ParsedDiffLine[] = [];
      let end = i;
      while (end < lines.length) {
        const next = parsedLines[end];
        if (!next || !isChangedDiffLine(next)) break;
        block.push(next);
        end++;
      }
      out.push(
        ...renderChangeBlock(block, lang, options.theme, lineNumberWidth, options.invalidate),
      );
      i = end - 1;
      continue;
    }

    out.push(
      renderDiffParsedLine(parsed, lang, options.theme, lineNumberWidth, options.invalidate),
    );
  }

  return out.join("\n");
}

function renderSeparator(line: string, theme: Theme): string {
  const safeLine = escapeControlChars(line);
  const trimmed = safeLine.trim();
  if (trimmed === "...") return theme.fg("muted", "      --- unchanged lines hidden ---");
  if (trimmed.startsWith("@@")) return theme.fg("accent", theme.bold(safeLine));
  if (trimmed.startsWith("---") || trimmed.startsWith("+++")) return theme.fg("muted", safeLine);
  if (trimmed.startsWith("diff ") || trimmed.startsWith("index "))
    return theme.fg("muted", safeLine);
  return theme.fg("toolDiffContext", safeLine);
}

function renderDiffParsedLine(
  parsed: ParsedDiffLine,
  lang: string | undefined,
  theme: Theme,
  lineNumberWidth: number,
  invalidate?: () => void,
): string {
  const highlighted = highlightSingleLine(
    parsed.content.replace(/\t/g, "   "),
    lang,
    theme,
    invalidate,
  );
  const lineNumber = formatDiffLineNumber(parsed.lineNumber, lineNumberWidth);
  if (parsed.kind === "+")
    return `${DIFF_ADD_MARKER}${theme.fg("toolDiffAdded", `+${lineNumber} │ `)}${highlighted}`;
  if (parsed.kind === "-")
    return `${DIFF_REMOVE_MARKER}${theme.fg("toolDiffRemoved", `-${lineNumber} │ `)}${highlighted}`;
  return dimAnsi(
    `${theme.fg("toolDiffContext", ` ${lineNumber} │ `)}${highlighted || theme.fg("toolDiffContext", "")}`,
  );
}

function renderChangeBlock(
  block: ParsedDiffLine[],
  lang: string | undefined,
  theme: Theme,
  lineNumberWidth: number,
  invalidate?: () => void,
): string[] {
  const emphasis = changedLineEmphasis(block);
  return block.map((line, index) => {
    const rendered = renderDiffParsedLine(line, lang, theme, lineNumberWidth, invalidate);
    const match = emphasis.get(index);
    return match ? emphasizeChangedSpans(rendered, match.ranges, match.kind) : rendered;
  });
}

function dimAnsi(text: string): string {
  return `\x1b[2m${text}\x1b[22m`;
}

function highlightSingleLine(
  line: string,
  lang: string | undefined,
  theme: Theme,
  invalidate?: () => void,
): string {
  return (
    renderWithShiki(line, lang, invalidate)?.[0] ?? theme.fg("toolOutput", escapeControlChars(line))
  );
}
