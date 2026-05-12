export type ParsedDiffLine = { kind: "+" | "-" | " "; lineNumber: string; content: string };
export type AddedDiffLine = ParsedDiffLine & { kind: "+" };
export type RemovedDiffLine = ParsedDiffLine & { kind: "-" };

export function diffLineNumberWidth(lines: Array<ParsedDiffLine | null>): number {
  return lines.reduce((width, line) => Math.max(width, normalizedDiffLineNumber(line).length), 0);
}

export function formatDiffLineNumber(lineNumber: string, width: number): string {
  return lineNumber.trim().padStart(width, " ");
}

function normalizedDiffLineNumber(line: ParsedDiffLine | null): string {
  return line?.lineNumber.trim() ?? "";
}

export function parseDiffLine(line: string): ParsedDiffLine | null {
  const match = line.match(/^([+\- ])(\s*\d*)\s(.*)$/);
  if (!match) return null;
  const kind = match[1] as ParsedDiffLine["kind"];
  return { kind, lineNumber: match[2], content: match[3] };
}

export function isAddedDiffLine(line: ParsedDiffLine | null): line is AddedDiffLine {
  return line?.kind === "+";
}

export function isRemovedDiffLine(line: ParsedDiffLine | null): line is RemovedDiffLine {
  return line?.kind === "-";
}

export function isChangedDiffLine(line: ParsedDiffLine): line is AddedDiffLine | RemovedDiffLine {
  return line.kind === "+" || line.kind === "-";
}
