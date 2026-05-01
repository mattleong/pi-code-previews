import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

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

export function visibleLength(text: string): number {
  return visibleWidth(text);
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
