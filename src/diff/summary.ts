import type { Theme } from "@earendil-works/pi-coding-agent";
import { countLabel } from "../shared/format";
import { forEachRawTextLine } from "../shared/text-lines";

export type DiffSummary = {
  additions: number;
  removals: number;
  replacements: number;
  insertions: number;
  deletions: number;
  totalLines: number;
  hunks: number;
};

export function diffSummarySeparator(theme: Theme): string {
  return theme.fg("muted", " · ");
}

export function describeDiffShape(summary: DiffSummary): string {
  const parts: string[] = [];
  if (summary.replacements > 0) parts.push(countLabel(summary.replacements, "replacement"));
  if (summary.insertions > 0) parts.push(countLabel(summary.insertions, "insertion"));
  if (summary.deletions > 0) parts.push(countLabel(summary.deletions, "deletion"));
  return parts.length ? parts.join(", ") : "changes";
}

export function summarizeDiff(diff: string): DiffSummary {
  let additions = 0;
  let removals = 0;
  let replacements = 0;
  let insertions = 0;
  let deletions = 0;
  let hunks = 0;
  let groupAdditions = 0;
  let groupRemovals = 0;
  let totalLines = 0;

  function flushChangeGroup() {
    if (groupAdditions === 0 && groupRemovals === 0) return;
    hunks++;
    if (groupAdditions > 0 && groupRemovals > 0) {
      replacements++;
      insertions += Math.max(0, groupAdditions - groupRemovals);
      deletions += Math.max(0, groupRemovals - groupAdditions);
    } else if (groupAdditions > 0) {
      insertions += groupAdditions;
    } else {
      deletions += groupRemovals;
    }
    groupAdditions = 0;
    groupRemovals = 0;
  }

  forEachRawTextLine(diff, (line) => {
    totalLines++;
    const isAddition = line.startsWith("+") && !line.startsWith("+++");
    const isRemoval = line.startsWith("-") && !line.startsWith("---");

    if (isAddition) {
      additions++;
      groupAdditions++;
    } else if (isRemoval) {
      removals++;
      groupRemovals++;
    } else {
      flushChangeGroup();
    }
  });
  flushChangeGroup();

  return {
    additions,
    removals,
    replacements,
    insertions,
    deletions,
    totalLines,
    hunks,
  };
}
