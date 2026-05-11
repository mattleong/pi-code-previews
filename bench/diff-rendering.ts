import type { DiffWordEmphasis } from "../src/settings/index";
import {
  benchTheme,
  formatDuration,
  formatMs,
  isEnabled,
  printBenchHeader,
  runBench as runSharedBench,
  timeOnce,
  type BenchResult as SharedBenchResult,
} from "./helpers";

const { renderSyntaxHighlightedDiff } = await import("../src/diff/index");
const { changedRanges } = await import("../src/diff/word/emphasis");
const { initializeShiki } = await import("../src/syntax/shiki");
const { codePreviewSettings, setCodePreviewSettings } = await import("../src/settings/index");

type BenchCase = {
  name: string;
  lang?: string;
  diff: string;
  before: string;
  after: string;
  rangePairs: Array<{ before: string; after: string }>;
  limit: number;
};

type BenchLayer = "render/plain" | "render/highlight" | "word-ranges";

type BenchResult = SharedBenchResult & {
  layer: BenchLayer;
  name: string;
};

type LargeScenario = {
  name: string;
  baseCase: string;
  pairCounts: number[];
  makePair: (index: number) => { before: string; after: string };
};

const MODES: DiffWordEmphasis[] = ["off", "smart", "all"];
const VERBOSE = isEnabled("BENCH_VERBOSE");
const LARGE_ACTUAL = isEnabled("BENCH_LARGE_ACTUAL");
let sink = 0;

const cases = makeCases();
const largeScenarios = makeLargeScenarios();
const previousSettings = { ...codePreviewSettings };

await initializeShiki(codePreviewSettings.shikiTheme);
try {
  printBenchHeader("diff rendering");

  const results: BenchResult[] = [];
  for (const benchCase of cases) {
    for (const mode of MODES) {
      setCodePreviewSettings({
        ...codePreviewSettings,
        wordEmphasis: mode,
        syntaxHighlighting: false,
      });
      results.push(
        runBench(benchCase.name, "render/plain", mode, () => {
          sink += renderSyntaxHighlightedDiff(
            benchCase.diff,
            undefined,
            benchTheme(),
            benchCase.limit,
          ).length;
        }),
      );

      setCodePreviewSettings({
        ...codePreviewSettings,
        wordEmphasis: mode,
        syntaxHighlighting: true,
      });
      results.push(
        runBench(benchCase.name, "render/highlight", mode, () => {
          sink += renderSyntaxHighlightedDiff(
            benchCase.diff,
            benchCase.lang,
            benchTheme(),
            benchCase.limit,
          ).length;
        }),
      );
    }

    for (const mode of MODES.filter((mode) => mode !== "off")) {
      setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: mode });
      results.push(
        runBench(benchCase.name, "word-ranges", mode, () => {
          for (const pair of benchCase.rangePairs) {
            const ranges = changedRanges(pair.before, pair.after);
            sink += ranges.removed.length + ranges.added.length;
          }
        }),
      );
    }
  }

  printSummary(results, cases);
  printLargeDiffEstimates(results, cases, largeScenarios);
  if (LARGE_ACTUAL) printActualLargeDiffTimings(largeScenarios);
  if (VERBOSE) printResults(results);
  else console.log("Set BENCH_VERBOSE=1 to print the full raw benchmark table.");
  if (!LARGE_ACTUAL)
    console.log("Set BENCH_LARGE_ACTUAL=1 to run one-shot actual large diff renders.");
  if (sink === Number.MIN_SAFE_INTEGER) console.log("sink", sink);
} finally {
  setCodePreviewSettings(previousSettings);
}

function runBench(caseName: string, layer: BenchLayer, mode: string, fn: () => void): BenchResult {
  const result = runSharedBench(caseName, layer, mode, fn);
  return { ...result, layer, name: `${caseName}: ${layer}` };
}

function printSummary(results: BenchResult[], benchCases: BenchCase[]): void {
  const rows = benchCases.map((benchCase) => {
    const off = findResult(results, benchCase.name, "render/plain", "off");
    const smartRender = findResult(results, benchCase.name, "render/plain", "smart");
    const allRender = findResult(results, benchCase.name, "render/plain", "all");
    const smartRanges = findResult(results, benchCase.name, "word-ranges", "smart");
    const smartOverhead = smartRender && off ? Math.max(0, smartRender.meanMs - off.meanMs) : 0;
    const allOverhead = allRender && off ? Math.max(0, allRender.meanMs - off.meanMs) : 0;
    const smartRangeP95 = smartRanges?.p95Ms ?? 0;
    const signalMs = Math.max(smartOverhead, smartRangeP95);
    return {
      case: benchCase.name,
      pairs: benchCase.rangePairs.length,
      "chars/pair": maxPairChars(benchCase.rangePairs),
      "smart render +ms": formatMs(smartOverhead),
      "all render +ms": formatMs(allOverhead),
      "smart ranges ms": formatMs(smartRanges?.meanMs ?? 0),
      "smart ranges p95": formatMs(smartRangeP95),
      verdict: verdict(signalMs),
    };
  });

  console.log("Word emphasis risk summary");
  console.table(rows);
  console.log(
    "Verdict bands use render mean overhead and word-range p95 cost: fine < 1ms, watch 1-8ms, problem > 8ms. The render columns show overhead versus wordEmphasis=off.",
  );
  console.log("");
}

function printLargeDiffEstimates(
  results: BenchResult[],
  benchCases: BenchCase[],
  scenarios: LargeScenario[],
): void {
  const rows = scenarios.map((scenario) => {
    const sourceCase = benchCases.find((benchCase) => benchCase.name === scenario.baseCase);
    const smartRanges = findResult(results, scenario.baseCase, "word-ranges", "smart");
    const msPerPair =
      smartRanges && sourceCase
        ? smartRanges.meanMs / Math.max(1, sourceCase.rangePairs.length)
        : 0;
    const estimates = Object.fromEntries(
      scenario.pairCounts.map((pairCount) => [
        `${pairCount} pairs`,
        formatDuration(msPerPair * pairCount),
      ]),
    );
    return {
      scenario: scenario.name,
      "chars/pair": sourceCase ? maxPairChars(sourceCase.rangePairs) : "?",
      "measured ms/pair": formatMs(msPerPair),
      ...estimates,
    };
  });

  console.log("Large diff word-emphasis estimates");
  console.table(rows);
  console.log(
    "These estimates multiply the measured smart word-ranges cost per changed pair. They isolate word-emphasis analysis, not syntax highlighting or terminal wrapping.",
  );
  console.log("");
}

function printActualLargeDiffTimings(scenarios: LargeScenario[]): void {
  const rows: Array<Record<string, string | number>> = [];
  for (const scenario of scenarios) {
    for (const pairCount of scenario.pairCounts) {
      const benchCase = largeCase(
        `${scenario.name} (${pairCount} pairs)`,
        pairCount,
        scenario.makePair,
      );
      setCodePreviewSettings({
        ...codePreviewSettings,
        wordEmphasis: "off",
        syntaxHighlighting: false,
      });
      const off = timeOnce(() => {
        sink += renderSyntaxHighlightedDiff(
          benchCase.diff,
          undefined,
          benchTheme(),
          benchCase.limit,
        ).length;
      });
      setCodePreviewSettings({
        ...codePreviewSettings,
        wordEmphasis: "smart",
        syntaxHighlighting: false,
      });
      const smart = timeOnce(() => {
        sink += renderSyntaxHighlightedDiff(
          benchCase.diff,
          undefined,
          benchTheme(),
          benchCase.limit,
        ).length;
      });
      rows.push({
        scenario: scenario.name,
        pairs: pairCount,
        "off render": formatDuration(off),
        "smart render": formatDuration(smart),
        "smart overhead": formatDuration(Math.max(0, smart - off)),
      });
    }
  }

  console.log("Actual large diff one-shot timings");
  console.table(rows);
  console.log("");
}

function findResult(
  results: BenchResult[],
  caseName: string,
  layer: BenchResult["layer"],
  mode: string,
): BenchResult | undefined {
  return results.find(
    (result) => result.caseName === caseName && result.layer === layer && result.mode === mode,
  );
}

function maxPairChars(pairs: Array<{ before: string; after: string }>): number {
  return pairs.reduce((max, pair) => Math.max(max, pair.before.length, pair.after.length), 0);
}

function verdict(ms: number): string {
  if (ms > 8) return "problem";
  if (ms >= 1) return "watch";
  return "fine";
}

function printResults(results: BenchResult[]): void {
  const rows = results.map((result) => ({
    benchmark: result.name,
    mode: result.mode,
    iterations: result.iterations,
    "mean ms/op": result.meanMs.toFixed(4),
    "median ms/op": result.medianMs.toFixed(4),
    "p95 ms/op": result.p95Ms.toFixed(4),
    "ops/sec": result.opsPerSec.toFixed(0),
  }));
  console.table(rows);
}

function makeCases(): BenchCase[] {
  const mediumShared = numberedWords("token", 180).join(" ");
  const longShared = numberedWords("shared", 600).join(" ");
  const unrelatedPair = unrelatedTokenPair(0, 420);
  const beforeMulti = Array.from(
    { length: 12 },
    (_, index) =>
      `- ${index + 1} const value${index} = source.${index % 2 ? "oldName" : "oldValue"};`,
  );
  const afterMulti = Array.from(
    { length: 12 },
    (_, index) =>
      `+ ${index + 1} const value${index} = target.${index % 2 ? "newName" : "newValue"};`,
  );

  return [
    pairCase(
      "small rename",
      "typescript",
      "const oldValue = line.trim();",
      "const newValue = safeLine.trim();",
    ),
    pairCase(
      "wrapper syntax",
      "typescript",
      "  .map((item) => item.title)",
      "  (item) => item.title",
    ),
    pairCase(
      "long appended markdown",
      "markdown",
      "You can also put code-preview defaults in `.pi/settings.json` globally or per project:",
      "You can also put code-preview defaults in `.pi/settings.json` globally or per project. Project settings override global settings, and the package settings file overrides both:",
    ),
    pairCase(
      "medium shared tokens",
      "typescript",
      `${mediumShared} oldValue ${mediumShared}`,
      `${mediumShared} newValue ${mediumShared}`,
    ),
    pairCase("unrelated token-heavy", "typescript", unrelatedPair.before, unrelatedPair.after),
    {
      name: "multi-line replacements",
      lang: "typescript",
      diff: [...beforeMulti, ...afterMulti].join("\n"),
      before: beforeMulti.map((line) => line.replace(/^-\s+\d+\s/, "")).join("\n"),
      after: afterMulti.map((line) => line.replace(/^\+\s+\d+\s/, "")).join("\n"),
      rangePairs: beforeMulti.map((before, index) => ({
        before: before.replace(/^-\s+\d+\s/, ""),
        after: (afterMulti[index] ?? "").replace(/^\+\s+\d+\s/, ""),
      })),
      limit: beforeMulti.length + afterMulti.length,
    },
    pairCase(
      "very long shared tokens",
      "typescript",
      `${longShared} oldValue ${longShared}`,
      `${longShared} newValue ${longShared}`,
    ),
  ];
}

function makeLargeScenarios(): LargeScenario[] {
  return [
    {
      name: "unrelated token-heavy",
      baseCase: "unrelated token-heavy",
      pairCounts: [10, 50, 100, 500],
      makePair: (index) => unrelatedTokenPair(index, 420),
    },
    {
      name: "code-like replacements",
      baseCase: "multi-line replacements",
      pairCounts: [100, 500, 1000],
      makePair: codeLikePair,
    },
    {
      name: "very long shared tokens",
      baseCase: "very long shared tokens",
      pairCounts: [10, 50, 100],
      makePair: veryLongSharedPair,
    },
  ];
}

function pairCase(name: string, lang: string, before: string, after: string): BenchCase {
  return {
    name,
    lang,
    diff: `- 1 ${before}\n+ 1 ${after}`,
    before,
    after,
    rangePairs: [{ before, after }],
    limit: 2,
  };
}

function largeCase(
  name: string,
  count: number,
  makePair: (index: number) => { before: string; after: string },
): BenchCase {
  const pairs = Array.from({ length: count }, (_, index) => makePair(index));
  return {
    name,
    lang: "typescript",
    diff: [
      ...pairs.map((pair, index) => `- ${index + 1} ${pair.before}`),
      ...pairs.map((pair, index) => `+ ${index + 1} ${pair.after}`),
    ].join("\n"),
    before: pairs.map((pair) => pair.before).join("\n"),
    after: pairs.map((pair) => pair.after).join("\n"),
    rangePairs: pairs,
    limit: pairs.length * 2,
  };
}

function numberedWords(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

function unrelatedTokenPair(index: number, tokenCount: number): { before: string; after: string } {
  return {
    before: numberedWords(`before${index}_`, tokenCount).join(" "),
    after: numberedWords(`after${index}_`, tokenCount).join(" "),
  };
}

function codeLikePair(index: number): { before: string; after: string } {
  return {
    before: `const value${index} = source.${index % 2 ? "oldName" : "oldValue"} ?? fallback${index};`,
    after: `const value${index} = target.${index % 2 ? "newName" : "newValue"} ?? fallback${index};`,
  };
}

function veryLongSharedPair(index: number): { before: string; after: string } {
  const shared = numberedWords(`shared${index}_`, 600).join(" ");
  return {
    before: `${shared} oldValue ${shared}`,
    after: `${shared} newValue ${shared}`,
  };
}
