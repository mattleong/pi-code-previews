import { diffWordsWithSpace } from "diff";
import { codePreviewSettings } from "./settings.ts";

export type WordChangeRanges = {
  removed: Array<[number, number]>;
  added: Array<[number, number]>;
};

export function changedRanges(before: string, after: string): WordChangeRanges {
  const removed: Array<[number, number]> = [];
  const added: Array<[number, number]> = [];
  let oldIndex = 0;
  let newIndex = 0;
  for (const part of diffWordsWithSpace(before, after)) {
    const length = part.value.length;
    const visibleChange = !/^\s+$/.test(part.value);
    if (part.removed) {
      if (visibleChange) removed.push([oldIndex, oldIndex + length]);
      oldIndex += length;
    } else if (part.added) {
      if (visibleChange) added.push([newIndex, newIndex + length]);
      newIndex += length;
    } else {
      oldIndex += length;
      newIndex += length;
    }
  }
  const ranges = { removed: mergeNearbyRanges(removed), added: mergeNearbyRanges(added) };
  return codePreviewSettings.wordEmphasis === "smart"
    ? filterLowSignalWordEmphasis(before, after, ranges)
    : ranges;
}

function filterLowSignalWordEmphasis(
  before: string,
  after: string,
  ranges: WordChangeRanges,
): WordChangeRanges {
  const hasRemovedSignal = ranges.removed.some((range) => hasSmartRangeSignal(before, range));
  const hasAddedSignal = ranges.added.some((range) => hasSmartRangeSignal(after, range));
  return {
    removed: ranges.removed.filter((range) =>
      shouldKeepSmartRange(before.slice(range[0], range[1]), hasAddedSignal),
    ),
    added: ranges.added.filter((range) =>
      shouldKeepSmartRange(after.slice(range[0], range[1]), hasRemovedSignal),
    ),
  };
}

function hasSmartRangeSignal(content: string, range: [number, number]): boolean {
  return /[A-Za-z0-9_$]/.test(content.slice(range[0], range[1]));
}

function shouldKeepSmartRange(text: string, oppositeSideHasSignal: boolean): boolean {
  if (!/[A-Za-z0-9_$]/.test(text)) return false;
  const tokens = text.match(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?/g) ?? [];
  if (tokens.length === 0) return false;
  if (!oppositeSideHasSignal && tokens.every((token) => LOW_SIGNAL_SYNTAX_TOKENS.has(token)))
    return false;
  if (!oppositeSideHasSignal && isWrapperCallNoise(text, tokens)) return false;
  return true;
}

const LOW_SIGNAL_SYNTAX_TOKENS = new Set([
  "as",
  "async",
  "await",
  "const",
  "else",
  "export",
  "from",
  "function",
  "if",
  "import",
  "let",
  "return",
  "var",
]);

const WRAPPER_CALL_TOKENS = new Set(["filter", "flatMap", "forEach", "map", "reduce"]);

function isWrapperCallNoise(text: string, tokens: string[]): boolean {
  return (
    tokens.length === 1 &&
    WRAPPER_CALL_TOKENS.has(tokens[0]!) &&
    /^[\s.()[\]{};,]*[A-Za-z_$][\w$]*[\s.()[\]{};,]*$/.test(text)
  );
}

function mergeNearbyRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const merged: Array<[number, number]> = [];
  for (const range of ranges.filter(([start, end]) => end > start)) {
    const previous = merged.at(-1);
    if (previous && range[0] - previous[1] <= 1) previous[1] = range[1];
    else merged.push([...range]);
  }
  return merged;
}
