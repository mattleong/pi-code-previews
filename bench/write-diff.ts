import { summarizeDiff } from "../src/diff/index";
import { createSimpleDiff, createStructuredDiff } from "../src/diff/structured";
import {
  formatDuration,
  isEnabled,
  printBenchHeader,
  printLayerSummary,
  printResults,
  runBench,
  timeOnce,
} from "./helpers";

let sink = 0;

type DiffInputCase = {
  name: string;
  before: string;
  after: string;
};

printBenchHeader("write/edit diff generation");
const cases = makeCases();
const results = [];

for (const benchCase of cases) {
  const precomputedDiff = createSimpleDiff(benchCase.before, benchCase.after);

  results.push(
    runBench(benchCase.name, "createStructuredDiff", caseSize(benchCase), () => {
      const hunks = createStructuredDiff(benchCase.before, benchCase.after);
      sink += hunks.length;
    }),
  );

  results.push(
    runBench(benchCase.name, "createSimpleDiff", caseSize(benchCase), () => {
      sink += createSimpleDiff(benchCase.before, benchCase.after).length;
    }),
  );

  results.push(
    runBench(
      benchCase.name,
      "summarizeDiff",
      `${diffLineCount(precomputedDiff)} diff lines`,
      () => {
        sink += summarizeDiff(precomputedDiff).totalLines;
      },
    ),
  );

  results.push(
    runBench(benchCase.name, "createSimpleDiff+summarize", caseSize(benchCase), () => {
      const diff = createSimpleDiff(benchCase.before, benchCase.after);
      sink += summarizeDiff(diff).totalLines;
    }),
  );
}

printLayerSummary(results);
console.log("createStructuredDiff measures diff package line diffing plus context compaction.");
console.log("createSimpleDiff includes formatting the structured hunks into renderable diff text.");
console.log("summarizeDiff isolates the full-diff scan that edit/write result headers perform.");
console.log("");
printResults(results);
if (isEnabled("BENCH_WRITE_LARGE")) printLargeOneShotTimings();
else console.log("Set BENCH_WRITE_LARGE=1 to run 100k-line one-shot diff timings.");
if (sink === Number.MIN_SAFE_INTEGER) console.log("sink", sink);

function makeCases(): DiffInputCase[] {
  const appendBefore = fileLines("const item", 5_000);
  const middleBefore = fileLines("const value", 10_000);
  const scatteredBefore = fileLines("const stable", 5_000);
  const rewriteBefore = fileLines("export const before", 2_000);
  return [
    {
      name: "append-only file",
      before: appendBefore,
      after: `${appendBefore}${fileLines("const appended", 200)}`,
    },
    {
      name: "single middle edit",
      before: middleBefore,
      after: replaceLine(middleBefore, 5_000, "const value5000 = computeReplacement(input5000);"),
    },
    {
      name: "many scattered hunks",
      before: scatteredBefore,
      after: scatteredBefore
        .split("\n")
        .map((line, index) => (index % 35 === 0 ? `${line} // changed ${index}` : line))
        .join("\n"),
    },
    {
      name: "whole-file rewrite",
      before: rewriteBefore,
      after: fileLines("export const after", 2_000),
    },
  ];
}

function printLargeOneShotTimings(): void {
  const largeBefore = fileLines("const large", 100_000);
  const largeAfter = replaceLine(largeBefore, 50_000, "const large50000 = editedLargeValue();");
  let diff = "";
  const createMs = timeOnce(() => {
    diff = createSimpleDiff(largeBefore, largeAfter);
    sink += diff.length;
  });
  const summaryMs = timeOnce(() => {
    sink += summarizeDiff(diff).totalLines;
  });
  console.log("");
  console.log("100k-line one-shot timings");
  console.table([
    {
      case: "single middle edit",
      createSimpleDiff: formatDuration(createMs),
      summarizeDiff: formatDuration(summaryMs),
      "diff lines": diffLineCount(diff),
    },
  ]);
}

function fileLines(prefix: string, count: number): string {
  return (
    Array.from({ length: count }, (_, index) => `${prefix}${index} = ${index};`).join("\n") + "\n"
  );
}

function replaceLine(text: string, lineIndex: number, replacement: string): string {
  const lines = text.split("\n");
  lines[lineIndex] = replacement;
  return lines.join("\n");
}

function diffLineCount(diff: string): number {
  return diff ? diff.split("\n").length : 0;
}

function caseSize(benchCase: DiffInputCase): string {
  return `${lineCount(benchCase.before)}->${lineCount(benchCase.after)} lines`;
}

function lineCount(text: string): number {
  return text.split("\n").length - 1;
}
