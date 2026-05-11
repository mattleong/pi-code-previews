import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  hiddenLinesMarker,
  selectPreviewLines,
  selectPreviewTextLines,
} from "../../preview/format";
import { codePreviewSettings } from "../../settings/index";
import { renderHighlightedText } from "../../syntax/shiki";
import { escapeControlChars } from "../../preview/terminal-text";

export function renderHighlightedPreviewText(
  text: string,
  limit: number,
  lang: string | undefined,
  theme: Theme,
  invalidate?: () => void,
  lineNumbers?: { firstLine: number; lineNumberWidth?: number },
): { lines: string[]; shown: number; hidden: number; total: number } {
  const preview = selectPreviewTextLines(text, limit);
  const numbered = lineNumbers
    ? {
        ...lineNumbers,
        lineNumberWidth:
          lineNumbers.lineNumberWidth ??
          String(lineNumbers.firstLine + Math.max(0, preview.total - 1)).length,
      }
    : undefined;
  return {
    ...renderHighlightedPreviewEntries(preview, lang, theme, invalidate, numbered),
    total: preview.total,
  };
}

function renderHighlightedPreviewEntries(
  preview: {
    entries: ReturnType<typeof selectPreviewLines<string>>["entries"];
    shown: number;
    hidden: number;
  },
  lang: string | undefined,
  theme: Theme,
  invalidate?: () => void,
  lineNumbers?: { firstLine: number; lineNumberWidth?: number },
): { lines: string[]; shown: number; hidden: number } {
  const lines: string[] = [];
  const lineNumberOptions =
    lineNumbers && codePreviewSettings.readLineNumbers ? lineNumbers : undefined;
  let chunk: Array<{ line: string; index: number }> = [];

  function flushChunk(): void {
    if (chunk.length === 0) return;
    const normalizedChunk = chunk.map((entry) => entry.line.replace(/\t/g, "   "));
    const highlighted = renderHighlightedText(normalizedChunk.join("\n"), lang, theme, invalidate);
    for (let index = 0; index < chunk.length; index++) {
      const rendered =
        highlighted[index] ??
        theme.fg("toolOutput", escapeControlChars(normalizedChunk[index] ?? ""));
      if (!lineNumberOptions) {
        lines.push(rendered);
        continue;
      }
      const width =
        lineNumberOptions.lineNumberWidth ??
        String(lineNumberOptions.firstLine + chunk[index]!.index).length;
      const lineNumber = String(lineNumberOptions.firstLine + chunk[index]!.index).padStart(
        width,
        " ",
      );
      lines.push(`${theme.fg("dim", `${lineNumber} │ `)}${rendered}`);
    }
    chunk = [];
  }

  for (const entry of preview.entries) {
    if (entry.kind === "hidden") {
      flushChunk();
      lines.push(hiddenLinesMarker(theme, entry.hidden));
    } else {
      chunk.push({ line: entry.line, index: entry.index });
    }
  }
  flushChunk();
  return { lines, shown: preview.shown, hidden: preview.hidden };
}

export function renderSelectedOutputLines(
  rawLines: string[],
  limit: number,
  theme: Theme,
  renderChunk: (chunk: string[]) => string[],
): { lines: string[]; shown: number; hidden: number } {
  const preview = selectPreviewLines(rawLines, limit);
  const lines: string[] = [];
  let chunk: string[] = [];

  function flushChunk(): void {
    if (chunk.length === 0) return;
    lines.push(...renderChunk(chunk));
    chunk = [];
  }

  for (const entry of preview.entries) {
    if (entry.kind === "hidden") {
      flushChunk();
      lines.push(hiddenLinesMarker(theme, entry.hidden));
    } else {
      chunk.push(entry.line);
    }
  }
  flushChunk();
  return { lines, shown: preview.shown, hidden: preview.hidden };
}
