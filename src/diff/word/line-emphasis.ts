import { bundledThemesInfo } from "shiki";
import { codePreviewSettings } from "../../settings/index";
import type { DiffWordEmphasis } from "../../settings/types";
import { injectVisibleRanges } from "../../shared/terminal-text";
import type { ParsedDiffLine } from "../parse";
import { analyzeChangedLineBlock } from "./change-block";
import { shouldEmphasizeChangedPair } from "./emphasis";

const shikiThemeTypes = new Map(bundledThemesInfo.map((theme) => [theme.id, theme.type]));

export function changedLineEmphasis(
  block: ParsedDiffLine[],
  wordEmphasis: DiffWordEmphasis,
): Map<number, { ranges: Array<[number, number]>; kind: "add" | "remove" }> {
  const emphasis = new Map<number, { ranges: Array<[number, number]>; kind: "add" | "remove" }>();
  if (wordEmphasis === "off") return emphasis;

  for (const { pair, ranges } of analyzeChangedLineBlock(block, wordEmphasis).ranges) {
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
      close: "\x1b[49m",
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
  if (shikiThemeTypes.get(codePreviewSettings.shikiTheme) === "light") {
    return kind === "add" ? "\x1b[48;2;194;209;194m" : "\x1b[48;2;216;182;182m";
  }
  return kind === "add" ? "\x1b[48;2;64;132;82m" : "\x1b[48;2;148;62;70m";
}
