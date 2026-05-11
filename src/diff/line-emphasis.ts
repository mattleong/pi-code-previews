import {
  changedLineTokens,
  indexedChangedLine,
  matchChangedLines,
  normalizedChangedContent,
} from "./line-matching";
import { isAddedDiffLine, isRemovedDiffLine, type ParsedDiffLine } from "./parse";
import { changedRangesForTokensWithConfidence, shouldEmphasizeChangedPair } from "./word/emphasis";

export function changedLineEmphasis(
  block: ParsedDiffLine[],
): Map<number, { ranges: Array<[number, number]>; kind: "add" | "remove" }> {
  const removed = block.flatMap((line, index) =>
    isRemovedDiffLine(line) ? [indexedChangedLine(index, line)] : [],
  );
  const added = block.flatMap((line, index) =>
    isAddedDiffLine(line) ? [indexedChangedLine(index, line)] : [],
  );
  const removedByIndex = new Map(removed.map((line) => [line.index, line]));
  const addedByIndex = new Map(added.map((line) => [line.index, line]));
  const emphasis = new Map<number, { ranges: Array<[number, number]>; kind: "add" | "remove" }>();

  for (const pair of matchChangedLines(removed, added)) {
    const removedLine = removedByIndex.get(pair.removedIndex);
    const addedLine = addedByIndex.get(pair.addedIndex);
    if (!removedLine || !addedLine) continue;
    const ranges = changedRangesForTokensWithConfidence(
      normalizedChangedContent(removedLine),
      normalizedChangedContent(addedLine),
      changedLineTokens(removedLine),
      changedLineTokens(addedLine),
    );
    if (!shouldEmphasizeChangedPair(ranges, pair.confidence)) continue;
    emphasis.set(pair.removedIndex, { ranges: ranges.removed, kind: "remove" });
    emphasis.set(pair.addedIndex, { ranges: ranges.added, kind: "add" });
  }

  return emphasis;
}

export function emphasizeChangedSpans(
  line: string,
  ranges: Array<[number, number]>,
  kind: "add" | "remove",
): string {
  if (ranges.length === 0) return line;
  const codeStart = findCodeStart(line);
  return (
    line.slice(0, codeStart) +
    injectVisibleRangeEmphasis(line.slice(codeStart), ranges, wordEmphasis(kind))
  );
}

function findCodeStart(line: string): number {
  const pipe = line.indexOf("│ ");
  if (pipe < 0) return 0;
  let index = pipe + "│ ".length;
  while (line[index] === "\x1b") {
    const end = line.indexOf("m", index);
    if (end < 0) break;
    index = end + 1;
  }
  return index;
}

function wordEmphasis(kind: "add" | "remove"): string {
  return kind === "add" ? "\x1b[48;2;64;132;82m\x1b[1m" : "\x1b[48;2;148;62;70m\x1b[1m";
}

function injectVisibleRangeEmphasis(
  ansi: string,
  ranges: Array<[number, number]>,
  open: string,
): string {
  let visible = 0;
  let rangeIndex = 0;
  let out = "";
  let active = false;
  for (let i = 0; i < ansi.length; i++) {
    const range = ranges[rangeIndex];
    if (ansi[i] === "\x1b") {
      const end = ansi.indexOf("m", i);
      if (end >= 0) {
        const seq = ansi.slice(i, end + 1);
        out += active && (seq === "\x1b[39m" || seq === "\x1b[22m") ? `${seq}${open}` : seq;
        i = end;
        continue;
      }
    }
    if (!active && range && visible === range[0]) {
      out += open;
      active = true;
    }
    if (active && range && visible === range[1]) {
      out += "\x1b[22m\x1b[49m";
      active = false;
      rangeIndex++;
    }
    out += ansi[i];
    visible++;
  }
  if (active) out += "\x1b[22m\x1b[49m";
  return out;
}
