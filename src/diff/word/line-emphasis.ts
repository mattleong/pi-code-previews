import { injectVisibleRanges } from "../../shared/terminal-text";
import type { ParsedDiffLine } from "../parse";
import { analyzeChangedLineBlock } from "./change-block";
import { shouldEmphasizeChangedPair } from "./emphasis";

export function changedLineEmphasis(
  block: ParsedDiffLine[],
): Map<number, { ranges: Array<[number, number]>; kind: "add" | "remove" }> {
  const emphasis = new Map<number, { ranges: Array<[number, number]>; kind: "add" | "remove" }>();

  for (const { pair, ranges } of analyzeChangedLineBlock(block).ranges) {
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
    injectVisibleRanges(line.slice(codeStart), ranges, {
      open: wordEmphasis(kind),
      close: "\x1b[22m\x1b[49m",
      reopenAfterSgr: (sequence) => sequence === "\x1b[39m" || sequence === "\x1b[22m",
    })
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
