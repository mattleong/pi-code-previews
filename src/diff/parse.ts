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
  const numbered = line.match(/^([+\- ])(\s*\d+)\s(.*)$/);
  if (numbered) {
    const kind = numbered[1] as ParsedDiffLine["kind"];
    return { kind, lineNumber: numbered[2], content: numbered[3] };
  }

  if (line.startsWith("+++") || line.startsWith("---")) return null;
  const prefix = line[0];
  if (prefix !== "+" && prefix !== "-" && prefix !== " ") return null;
  return { kind: prefix, lineNumber: "", content: line.slice(1) };
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
