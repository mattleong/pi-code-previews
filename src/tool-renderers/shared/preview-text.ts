import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  hiddenLinesMarker,
  selectPreviewLines,
  selectPreviewTextLines,
  type PreviewLineEntry,
} from "../../preview/format";
import { renderHighlightedText } from "../../syntax/shiki";
import { expandPreviewTabs } from "../../shared/preview-tabs";
import { escapeControlChars } from "../../shared/terminal-text";

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
    entries: Array<PreviewLineEntry<string>>;
    shown: number;
    hidden: number;
  },
  lang: string | undefined,
  theme: Theme,
  invalidate?: () => void,
  lineNumbers?: { firstLine: number; lineNumberWidth?: number },
): { lines: string[]; shown: number; hidden: number } {
  return renderChunkedPreviewEntries(preview, theme, (chunk) => {
    const normalizedChunk = chunk.map((entry) => expandPreviewTabs(entry.line));
    const highlighted = renderHighlightedText(normalizedChunk.join("\n"), lang, theme, invalidate);
    return chunk.map((entry, index) => {
      const rendered =
        highlighted[index] ??
        theme.fg("toolOutput", escapeControlChars(normalizedChunk[index] ?? ""));
      if (!lineNumbers) return rendered;
      const width =
        lineNumbers.lineNumberWidth ?? String(lineNumbers.firstLine + entry.index).length;
      const lineNumber = String(lineNumbers.firstLine + entry.index).padStart(width, " ");
      return `${theme.fg("dim", `${lineNumber} │ `)}${rendered}`;
    });
  });
}

export function renderSelectedOutputLines(
  rawLines: string[],
  limit: number,
  theme: Theme,
  renderChunk: (chunk: string[]) => string[],
): { lines: string[]; shown: number; hidden: number } {
  return renderChunkedPreviewEntries(selectPreviewLines(rawLines, limit), theme, (chunk) =>
    renderChunk(chunk.map((entry) => entry.line)),
  );
}

function renderChunkedPreviewEntries<T>(
  preview: { entries: Array<PreviewLineEntry<T>>; shown: number; hidden: number },
  theme: Theme,
  renderChunk: (chunk: Array<{ line: T; index: number }>) => string[],
): { lines: string[]; shown: number; hidden: number } {
  const lines: string[] = [];
  let chunk: Array<{ line: T; index: number }> = [];

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
      chunk.push({ line: entry.line, index: entry.index });
    }
  }
  flushChunk();
  return { lines, shown: preview.shown, hidden: preview.hidden };
}
