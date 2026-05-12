import { diffLines } from "diff";

export type StructuredDiffLine = {
  kind: "context" | "add" | "remove" | "separator";
  oldLine?: number;
  newLine?: number;
  content: string;
};

export interface StructuredDiffHunk {
  header: string;
  lines: StructuredDiffLine[];
}

export function createSimpleDiff(before: string, after: string): string {
  return formatStructuredDiff(createStructuredDiff(before, after));
}

export function createStructuredDiff(before: string, after: string): StructuredDiffHunk[] {
  const changes = diffLines(before, after);
  const hasChangeAfter = changes.map(() => false);
  let futureChangeSeen = false;
  for (let index = changes.length - 1; index >= 0; index--) {
    hasChangeAfter[index] = futureChangeSeen;
    const change = changeAt(changes, index);
    if (change.added || change.removed) futureChangeSeen = true;
  }

  const lines: StructuredDiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  const context = 3;
  let emittedChange = false;
  let firstChangeLine = 1;

  for (let index = 0; index < changes.length; index++) {
    const change = changeAt(changes, index);
    const chunkLines = splitDiffLines(change.value);

    if (!change.added && !change.removed) {
      const hasFutureChange = hasChangeAfter[index];
      if (!emittedChange && hasFutureChange) {
        const start = Math.max(0, chunkLines.length - context);
        lines.push(...contextLines(chunkLines.slice(start), oldLine + start, newLine + start));
      } else if (emittedChange) {
        lines.push(
          ...(hasFutureChange
            ? compactContextLines(chunkLines, oldLine, newLine, context)
            : contextLines(chunkLines.slice(0, context), oldLine, newLine)),
        );
      }
      oldLine += chunkLines.length;
      newLine += chunkLines.length;
      continue;
    }

    if (!emittedChange) firstChangeLine = newLine;
    emittedChange = true;
    for (const line of chunkLines) {
      if (change.removed) lines.push({ kind: "remove", oldLine: oldLine++, content: line });
      else if (change.added) lines.push({ kind: "add", newLine: newLine++, content: line });
    }
  }

  return lines.length ? [{ header: `@@ ${firstChangeLine} @@`, lines }] : [];
}

function changeAt(
  changes: ReturnType<typeof diffLines>,
  index: number,
): ReturnType<typeof diffLines>[number] {
  const change = changes[index];
  if (change === undefined) throw new RangeError(`Missing diff change ${index}`);
  return change;
}

function formatStructuredDiff(hunks: StructuredDiffHunk[]): string {
  return hunks.flatMap((hunk) => [hunk.header, ...hunk.lines.map(formatStructuredLine)]).join("\n");
}

function formatStructuredLine(line: StructuredDiffLine): string {
  if (line.kind === "separator") return "...";
  if (line.kind === "add") return `+${line.newLine ?? ""} ${line.content}`;
  if (line.kind === "remove") return `-${line.oldLine ?? ""} ${line.content}`;
  return ` ${line.newLine ?? line.oldLine ?? ""} ${line.content}`;
}

function splitDiffLines(value: string): string[] {
  const lines = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function compactContextLines(
  lines: string[],
  oldFirstLine: number,
  newFirstLine: number,
  context: number,
): StructuredDiffLine[] {
  if (lines.length <= context * 2) return contextLines(lines, oldFirstLine, newFirstLine);
  return [
    ...contextLines(lines.slice(0, context), oldFirstLine, newFirstLine),
    { kind: "separator", content: "..." } satisfies StructuredDiffLine,
    ...contextLines(
      lines.slice(-context),
      oldFirstLine + lines.length - context,
      newFirstLine + lines.length - context,
    ),
  ];
}

function contextLines(
  lines: string[],
  oldFirstLine: number,
  newFirstLine: number,
): StructuredDiffLine[] {
  return lines.map((content, offset) => ({
    kind: "context",
    oldLine: oldFirstLine + offset,
    newLine: newFirstLine + offset,
    content,
  }));
}
