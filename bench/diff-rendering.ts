import { performance } from "node:perf_hooks";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { DiffWordEmphasis } from "../src/settings.ts";

process.env.CODE_PREVIEW_WORD_EMPHASIS_SYNC_COST ??= "1000000000";
process.env.CODE_PREVIEW_WORD_EMPHASIS_SYNC_LINE_CHARS ??= "1000000";
process.env.CODE_PREVIEW_WORD_EMPHASIS_SYNC_PAIRS ??= "100000";
process.env.CODE_PREVIEW_WORD_EMPHASIS_SYNC_BLOCK_LINES ??= "100000";
process.env.CODE_PREVIEW_WORD_EMPHASIS_LAZY_COST ??= "1000000000";
process.env.CODE_PREVIEW_WORD_EMPHASIS_LAZY_LINE_CHARS ??= "1000000";
process.env.CODE_PREVIEW_WORD_EMPHASIS_LAZY_PAIRS ??= "100000";
process.env.CODE_PREVIEW_WORD_EMPHASIS_LAZY_BLOCK_LINES ??= "100000";

const { renderSyntaxHighlightedDiff } = await import("../src/diff.ts");
const { changedRanges } = await import("../src/diff-word-emphasis.ts");
const { initializeShiki } = await import("../src/shiki.ts");
const { codePreviewSettings, setCodePreviewSettings } = await import("../src/settings.ts");

type BenchCase = {
  name: string;
  lang?: string;
  diff: string;
  before: string;
  after: string;
  rangePairs: Array<{ before: string; after: string }>;
  limit: number;
};

type BenchResult = {
  caseName: string;
  layer: "render/plain" | "render/highlight" | "word-ranges";
  name: string;
  mode: string;
  iterations: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  opsPerSec: number;
};

const WARMUP_MS = readPositiveNumber("BENCH_WARMUP_MS", 20);
const SAMPLE_MS = readPositiveNumber("BENCH_SAMPLE_MS", 80);
const SAMPLES = Math.floor(readPositiveNumber("BENCH_SAMPLES", 5));
const MODES: DiffWordEmphasis[] = ["off", "smart", "all"];
const VERBOSE = isEnabled("BENCH_VERBOSE");
let sink = 0;

const cases = makeCases();
const previousSettings = { ...codePreviewSettings };

await initializeShiki(codePreviewSettings.shikiTheme);
try {
  console.log(`pi-code-previews diff rendering benchmark`);
  console.log(`node=${process.version} platform=${process.platform}/${process.arch}`);
  console.log(`timestamp=${new Date().toISOString()}`);
  console.log(`warmupMs=${WARMUP_MS} sampleMs=${SAMPLE_MS} samples=${SAMPLES}`);
  console.log("");

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
  if (VERBOSE) printResults(results);
  else console.log("Set BENCH_VERBOSE=1 to print the full raw benchmark table.");
  if (sink === Number.MIN_SAFE_INTEGER) console.log("sink", sink);
} finally {
  setCodePreviewSettings(previousSettings);
}

function runBench(
  caseName: string,
  layer: BenchResult["layer"],
  mode: string,
  fn: () => void,
): BenchResult {
  runFor(WARMUP_MS, fn);
  const samples: Array<{ iterations: number; ms: number }> = [];
  for (let sample = 0; sample < SAMPLES; sample++) samples.push(runFor(SAMPLE_MS, fn));
  const iterations = samples.reduce((total, sample) => total + sample.iterations, 0);
  const totalMs = samples.reduce((total, sample) => total + sample.ms, 0);
  const sampleMeans = samples.map((sample) => sample.ms / sample.iterations).sort((a, b) => a - b);
  const meanMs = totalMs / iterations;
  return {
    caseName,
    layer,
    name: `${caseName}: ${layer}`,
    mode,
    iterations,
    meanMs,
    medianMs: percentile(sampleMeans, 0.5),
    p95Ms: percentile(sampleMeans, 0.95),
    opsPerSec: 1000 / meanMs,
  };
}

function runFor(ms: number, fn: () => void): { iterations: number; ms: number } {
  const start = performance.now();
  const deadline = start + ms;
  let iterations = 0;
  do {
    fn();
    iterations++;
  } while (performance.now() < deadline);
  return { iterations, ms: performance.now() - start };
}

function percentile(sorted: number[], percentileValue: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index] ?? 0;
}

function printSummary(results: BenchResult[], benchCases: BenchCase[]): void {
  const rows = benchCases.map((benchCase) => {
    const off = findResult(results, benchCase.name, "render/plain", "off");
    const smartRender = findResult(results, benchCase.name, "render/plain", "smart");
    const allRender = findResult(results, benchCase.name, "render/plain", "all");
    const smartRanges = findResult(results, benchCase.name, "word-ranges", "smart");
    const smartOverhead = smartRender && off ? Math.max(0, smartRender.meanMs - off.meanMs) : 0;
    const allOverhead = allRender && off ? Math.max(0, allRender.meanMs - off.meanMs) : 0;
    const signalMs = Math.max(smartOverhead, smartRanges?.meanMs ?? 0);
    return {
      case: benchCase.name,
      pairs: benchCase.rangePairs.length,
      "chars/pair": maxPairChars(benchCase.rangePairs),
      "smart render +ms": formatMs(smartOverhead),
      "all render +ms": formatMs(allOverhead),
      "smart ranges ms": formatMs(smartRanges?.meanMs ?? 0),
      verdict: verdict(signalMs),
    };
  });

  console.log("Word emphasis risk summary");
  console.table(rows);
  console.log(
    "Verdict bands use mean cost: fine < 1ms, watch 1-8ms, problem > 8ms. The render columns show overhead versus wordEmphasis=off.",
  );
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

function formatMs(ms: number): string {
  return ms.toFixed(ms >= 10 ? 1 : 3);
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
  const beforeUnrelated = numberedWords("before", 420).join(" ");
  const afterUnrelated = numberedWords("after", 420).join(" ");
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
    pairCase("unrelated token-heavy", "typescript", beforeUnrelated, afterUnrelated),
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

function numberedWords(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

function benchTheme(): Theme {
  return {
    bold: (text: string) => text,
    fg: (_key: string, text: string) => text,
  } as Theme;
}

function readPositiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isEnabled(name: string): boolean {
  return /^(?:1|true|yes|on)$/i.test(process.env[name] ?? "");
}
