import type { DiffWordEmphasis } from "../src/settings/types";
import { renderSyntaxHighlightedDiff } from "../src/diff/index";
import { wordEmphasisTelemetry } from "../src/testing/word-emphasis-telemetry";
import { changedRanges, changedRangesWithConfidence } from "../src/diff/word/emphasis";
import { codePreviewSettings, setCodePreviewSettings } from "../src/settings/index";
import {
  benchTheme,
  formatDuration,
  formatMs,
  printBenchHeader,
  printLayerSummary,
  printResults,
  runBench,
} from "./helpers";

let sink = 0;
const theme = benchTheme();
const previousSettings = { ...codePreviewSettings };
const MODES: DiffWordEmphasis[] = ["smart", "all"];

type WordCase = {
  name: string;
  before: string;
  after: string;
};

type PairingCase = {
  name: string;
  diff: string;
  lines: number;
};

try {
  printBenchHeader("word-emphasis and changed-line pathology");
  setCodePreviewSettings({
    ...codePreviewSettings,
    syntaxHighlighting: false,
    wordEmphasis: "smart",
  });

  const results = [];
  for (const benchCase of makeWordCases()) {
    for (const mode of MODES) {
      setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: mode });
      results.push(
        runBench(benchCase.name, "changedRanges", mode, () => {
          const ranges = changedRanges(benchCase.before, benchCase.after, mode);
          sink += ranges.removed.length + ranges.added.length;
        }),
      );
    }
  }

  for (const benchCase of makePairingCases()) {
    for (const mode of ["off", "smart"] as const) {
      setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: mode });
      results.push(
        runBench(benchCase.name, "renderChangedBlock", mode, () => {
          sink += renderSyntaxHighlightedDiff(
            benchCase.diff,
            "typescript",
            theme,
            benchCase.lines,
          ).length;
        }),
      );
    }
  }

  printLayerSummary(results);
  printOverheadSummary(results);
  printConfidenceSummary(makeWordCases(), makePairingCases());
  console.log("changedRanges cases target weighted exact LCS and anchor fallback paths.");
  console.log(
    "renderChangedBlock cases target exact and positional fallback changed-line pairing.",
  );
  console.log("");
  printResults(results);
  if (sink === Number.MIN_SAFE_INTEGER) console.log("sink", sink);
} finally {
  setCodePreviewSettings(previousSettings);
}

function makeWordCases(): WordCase[] {
  return [
    {
      name: "token weighted LCS boundary 512x512 reversed",
      before: numberedTokens("tok", 512).join(" "),
      after: numberedTokens("tok", 512).reverse().join(" "),
    },
    {
      name: "token anchor fallback 513x513 reversed",
      before: numberedTokens("tok", 513).join(" "),
      after: numberedTokens("tok", 513).reverse().join(" "),
    },
    {
      name: "repeated tokens no unique anchors fallback",
      before: repeatedTokens("before", 520),
      after: repeatedTokens("after", 520),
    },
    {
      name: "very long identifier refinement",
      before: `const ${longIdentifier("Old", 28)} = source.${longIdentifier("Value", 24)};`,
      after: `const ${longIdentifier("New", 28)} = target.${longIdentifier("Value", 24)};`,
    },
    {
      name: "wrapper syntax smart-filter noise",
      before: "  .map((item) => item.title)",
      after: "  (item) => item.title",
    },
  ];
}

function makePairingCases(): PairingCase[] {
  return [
    { name: "line pairing exact boundary 32x32", ...pairingDiff(32, similarBefore, similarAfter) },
    {
      name: "line pairing fallback boundary 33x33",
      ...pairingDiff(33, similarBefore, similarAfter),
    },
    { name: "line pairing fallback 100x100", ...pairingDiff(100, similarBefore, similarAfter) },
    {
      name: "line pairing repeated reordered 32x32",
      ...pairingDiff(32, repeatedBefore, repeatedAfter),
    },
  ];
}

function printOverheadSummary(
  results: Array<{ caseName: string; layer: string; mode: string; meanMs: number }>,
): void {
  const rows = makePairingCases().map((benchCase) => {
    const off = findResult(results, benchCase.name, "renderChangedBlock", "off");
    const smart = findResult(results, benchCase.name, "renderChangedBlock", "smart");
    const overhead = off && smart ? Math.max(0, smart.meanMs - off.meanMs) : 0;
    return {
      case: benchCase.name,
      "off mean": off ? `${formatMs(off.meanMs)}ms` : "?",
      "smart mean": smart ? `${formatMs(smart.meanMs)}ms` : "?",
      "smart overhead": formatDuration(overhead),
    };
  });
  console.log("Changed-line pairing overhead summary");
  console.table(rows);
  console.log("");
}

function printConfidenceSummary(wordCases: WordCase[], pairingCases: PairingCase[]): void {
  setCodePreviewSettings({ ...codePreviewSettings, wordEmphasis: "smart" });
  console.log("Word emphasis confidence summary");
  console.table(
    wordCases.map((benchCase) => {
      const ranges = changedRangesWithConfidence(benchCase.before, benchCase.after, "smart");
      return {
        case: benchCase.name,
        confidence: ranges.confidence,
        removedRanges: ranges.removed.length,
        addedRanges: ranges.added.length,
      };
    }),
  );
  console.log("Changed-line pair confidence summary");
  console.table(
    pairingCases.map((benchCase) => {
      const telemetry = wordEmphasisTelemetry(benchCase.diff, benchCase.lines, "smart");
      return {
        case: benchCase.name,
        pairs: telemetry.emphasizedPairs,
        skipped: telemetry.skippedPairs + telemetry.skippedPotentialPairs,
        pairHigh: telemetry.pairConfidence.high,
        pairMedium: telemetry.pairConfidence.medium,
        pairLow: telemetry.pairConfidence.low,
        rangeHigh: telemetry.rangeConfidence.high,
        rangeMedium: telemetry.rangeConfidence.medium,
        rangeLow: telemetry.rangeConfidence.low,
      };
    }),
  );
  console.log("");
}

function findResult(
  results: Array<{ caseName: string; layer: string; mode: string; meanMs: number }>,
  caseName: string,
  layer: string,
  mode: string,
): { meanMs: number } | undefined {
  return results.find(
    (result) => result.caseName === caseName && result.layer === layer && result.mode === mode,
  );
}

function pairingDiff(
  count: number,
  before: (index: number) => string,
  after: (index: number) => string,
): { diff: string; lines: number } {
  const lines = [
    ...Array.from({ length: count }, (_, index) => `- ${index + 1} ${before(index)}`),
    ...Array.from({ length: count }, (_, index) => `+ ${index + 1} ${after(index)}`),
  ];
  return { diff: lines.join("\n"), lines: lines.length };
}

function similarBefore(index: number): string {
  return `const value${index} = source.oldName${index % 5}(input${index}) ?? fallback${index};`;
}

function similarAfter(index: number): string {
  return `const value${index} = target.newName${index % 5}(safeInput${index}) ?? fallback${index};`;
}

function repeatedBefore(index: number): string {
  return `items.map((item) => item.shared${index % 4}).filter(Boolean) // old ${index % 3}`;
}

function repeatedAfter(index: number): string {
  const reversed = 31 - index;
  return `items.map((item) => item.shared${reversed % 4}).filter(Boolean) // new ${reversed % 3}`;
}

function numberedTokens(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

function repeatedTokens(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `${prefix}${index % 7}`).join(" ");
}

function longIdentifier(marker: string, parts: number): string {
  return Array.from({ length: parts }, (_, index) => `${marker}Segment${index}`).join("");
}
