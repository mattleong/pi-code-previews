import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function escapeControlChars(text: string): string {
  return text
    .replace(/\x1b/g, "␛")
    .replace(/\r/g, "␍")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "�");
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

export function injectVisibleRanges(
  ansi: string,
  ranges: Array<[number, number]>,
  options: {
    open: string;
    close: string;
    reopenAfterSgr?: (sequence: string) => boolean;
  },
): string {
  let visible = 0;
  let out = "";
  let active = false;
  let rangeIndex = 0;
  const sorted = ranges.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < ansi.length; i++) {
    const sgr = extractSgr(ansi, i);
    if (sgr) {
      out +=
        active && options.reopenAfterSgr?.(sgr.sequence)
          ? `${sgr.sequence}${options.open}`
          : sgr.sequence;
      i += sgr.sequence.length - 1;
      continue;
    }
    while (rangeIndex < sorted.length && visible >= sorted[rangeIndex]![1]) {
      if (active) {
        out += options.close;
        active = false;
      }
      rangeIndex++;
    }
    const range = sorted[rangeIndex];
    if (!active && range && visible >= range[0] && visible < range[1]) {
      out += options.open;
      active = true;
    }
    out += ansi[i];
    visible++;
  }
  if (active) out += options.close;
  return out;
}

export function wrapAnsiToWidth(
  text: string,
  width: number,
  maxRows = 3,
  continuationPrefix = "",
): string[] {
  if (width <= 0) return [""];
  const rows: string[] = [];
  let row = "";
  let rowWidth = 0;
  let index = 0;
  let state = "";
  const continuationWidth = visibleWidth(continuationPrefix);

  function pushRow(): boolean {
    rows.push(truncateToWidth(row, width, ""));
    if (rows.length >= maxRows) {
      truncateLastRow(rows, width);
      return false;
    }
    row = continuationPrefix ? state + continuationPrefix : state;
    rowWidth = continuationWidth;
    return true;
  }

  while (index < text.length) {
    const ansi = extractSgr(text, index);
    if (ansi) {
      row += ansi.sequence;
      state = updateAnsiState(state, ansi.sequence);
      index += ansi.sequence.length;
      continue;
    }

    const nextAnsi = text.indexOf("\x1b", index);
    const plainEnd = nextAnsi >= 0 ? nextAnsi : text.length;
    const plain = text.slice(index, plainEnd);
    for (const { segment } of segmenter.segment(plain)) {
      const segmentWidth = visibleWidth(segment);
      if (rowWidth > 0 && rowWidth + segmentWidth > width && !pushRow()) return rows;
      if (segmentWidth > width && rowWidth === 0) {
        const clipped = truncateToWidth(segment, width, "");
        if (clipped) {
          row += clipped;
          rowWidth += visibleWidth(clipped);
        }
        if (!pushRow()) return rows;
        continue;
      }
      row += segment;
      rowWidth += segmentWidth;
    }
    index = plainEnd;
  }

  rows.push(truncateToWidth(row, width, ""));
  if (rows.length > maxRows) return truncateLastRow(rows.slice(0, maxRows), width);
  return rows;
}

function truncateLastRow(rows: string[], width: number): string[] {
  const last = rows.at(-1) ?? "";
  if (visibleWidth(last) >= width && width > 1)
    rows[rows.length - 1] = truncateToWidth(last, width - 1, "") + "›";
  return rows;
}

function extractSgr(text: string, index: number): { sequence: string } | undefined {
  if (text[index] !== "\x1b" || text[index + 1] !== "[") return undefined;
  let end = index + 2;
  while (end < text.length && text[end] !== "m") end++;
  if (end >= text.length) return undefined;
  return { sequence: text.slice(index, end + 1) };
}

function updateAnsiState(current: string, sequence: string): string {
  if (sequence === "\x1b[0m") return "";
  if (/^\x1b\[3(?:8;[^m]+|9)m$/.test(sequence))
    return replaceAnsi(current, /\x1b\[3(?:8;[^m]+|9)m/g, sequence === "\x1b[39m" ? "" : sequence);
  if (/^\x1b\[4(?:8;[^m]+|9)m$/.test(sequence))
    return replaceAnsi(current, /\x1b\[4(?:8;[^m]+|9)m/g, sequence === "\x1b[49m" ? "" : sequence);
  if (sequence === "\x1b[22m") return current.replace(/\x1b\[(?:1|2)m/g, "");
  if (sequence === "\x1b[1m") return replaceAnsi(current, /\x1b\[1m/g, sequence);
  if (sequence === "\x1b[2m") return replaceAnsi(current, /\x1b\[2m/g, sequence);
  if (sequence === "\x1b[3m" || sequence === "\x1b[23m")
    return replaceAnsi(current, /\x1b\[(?:3|23)m/g, sequence === "\x1b[23m" ? "" : sequence);
  if (sequence === "\x1b[4m" || sequence === "\x1b[24m")
    return replaceAnsi(current, /\x1b\[(?:4|24)m/g, sequence === "\x1b[24m" ? "" : sequence);
  return current + sequence;
}

function replaceAnsi(current: string, pattern: RegExp, replacement: string): string {
  return current.replace(pattern, "") + replacement;
}
