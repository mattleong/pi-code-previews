import { isChangedDiffLine, type ParsedDiffLine } from "./parse";

export function collectChangedDiffBlock(
  parsedLines: readonly (ParsedDiffLine | null | undefined)[],
  start: number,
): { block: ParsedDiffLine[]; end: number } {
  const block: ParsedDiffLine[] = [];
  let end = start;
  while (end < parsedLines.length) {
    const next = parsedLines[end];
    if (!next || !isChangedDiffLine(next)) break;
    block.push(next);
    end++;
  }
  return { block, end };
}
