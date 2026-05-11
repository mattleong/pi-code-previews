import type { AppKeybinding, Theme } from "@earendil-works/pi-coding-agent";
import { getKeybindings } from "@earendil-works/pi-tui";
import { forEachRawTextLine } from "../shared/text-lines";

export type PreviewLineEntry<T> =
  | { kind: "line"; line: T; index: number }
  | { kind: "hidden"; hidden: number };

type PreviewWindowPlan =
  | { kind: "all"; shown: number; hidden: number }
  | { kind: "head"; shown: number; hidden: number }
  | { kind: "split"; head: number; tail: number; shown: number; hidden: number };

export function selectPreviewLines<T>(
  lines: T[],
  limit: number,
): { entries: Array<PreviewLineEntry<T>>; shown: number; hidden: number } {
  const plan = previewWindowPlan(lines.length, limit);
  if (plan.kind === "all") {
    return {
      entries: lines.map((line, index) => ({ kind: "line", line, index })),
      shown: plan.shown,
      hidden: plan.hidden,
    };
  }
  if (plan.kind === "head") {
    return {
      entries: lines.slice(0, plan.shown).map((line, index) => ({ kind: "line", line, index })),
      shown: plan.shown,
      hidden: plan.hidden,
    };
  }
  return {
    entries: [
      ...lines.slice(0, plan.head).map((line, index) => ({ kind: "line" as const, line, index })),
      { kind: "hidden", hidden: plan.hidden },
      ...lines.slice(lines.length - plan.tail).map((line, offset) => ({
        kind: "line" as const,
        line,
        index: lines.length - plan.tail + offset,
      })),
    ],
    shown: plan.shown,
    hidden: plan.hidden,
  };
}

function previewWindowPlan(total: number, limit: number): PreviewWindowPlan {
  if (total <= limit || limit <= 0) return { kind: "all", shown: total, hidden: 0 };
  if (limit < 8) return { kind: "head", shown: limit, hidden: total - limit };
  const head = Math.ceil(limit * 0.65);
  const tail = Math.max(1, limit - head - 1);
  return { kind: "split", head, tail, shown: head + tail, hidden: total - head - tail };
}

export function previewLines(
  lines: string[],
  limit: number,
  theme: Theme,
): { lines: string[]; shown: number; hidden: number } {
  const preview = selectPreviewLines(lines, limit);
  return {
    lines: preview.entries.map((entry) =>
      entry.kind === "hidden" ? hiddenLinesMarker(theme, entry.hidden) : entry.line,
    ),
    shown: preview.shown,
    hidden: preview.hidden,
  };
}

export function selectPreviewTextLines(
  text: string,
  limit: number,
): { entries: Array<PreviewLineEntry<string>>; shown: number; hidden: number; total: number } {
  const total = countTrimmedTextLines(text);
  if (total === 0) return { entries: [], shown: 0, hidden: 0, total: 0 };
  const plan = previewWindowPlan(total, limit);
  if (plan.kind === "all") {
    const entries: Array<PreviewLineEntry<string>> = [];
    forEachTrimmedTextLine(text, (line, index) => entries.push({ kind: "line", line, index }));
    return { entries, shown: plan.shown, hidden: plan.hidden, total };
  }
  if (plan.kind === "head") {
    const entries: Array<PreviewLineEntry<string>> = [];
    forEachTrimmedTextLine(text, (line, index) => {
      if (index < limit) entries.push({ kind: "line", line, index });
    });
    return { entries, shown: plan.shown, hidden: plan.hidden, total };
  }
  const tailStart = total - plan.tail;
  const entries: Array<PreviewLineEntry<string>> = [];
  let markerAdded = false;
  forEachTrimmedTextLine(text, (line, index) => {
    if (index < plan.head) {
      entries.push({ kind: "line", line, index });
      return;
    }
    if (index >= tailStart) {
      if (!markerAdded) {
        entries.push({ kind: "hidden", hidden: plan.hidden });
        markerAdded = true;
      }
      entries.push({ kind: "line", line, index });
    }
  });
  return { entries, shown: plan.shown, hidden: plan.hidden, total };
}

export function hiddenLinesMarker(theme: Theme, hidden: number): string {
  return theme.fg("muted", `      --- ${hidden} lines hidden ---`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function trimSingleTrailingNewline(text: string): string {
  if (text.endsWith("\r\n")) return text.slice(0, -2);
  if (text.endsWith("\n")) return text.slice(0, -1);
  return text;
}

export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function metadata(theme: Theme, parts: Array<string | undefined>): string {
  const present = parts.filter((part): part is string => Boolean(part));
  return present.length ? theme.fg("dim", ` · ${present.join(" · ")}`) : "";
}

export function themedKeyHint(
  theme: Theme,
  keybinding: AppKeybinding,
  description: string,
): string {
  const keyText = formatKeys(getKeybindings().getKeys(keybinding));
  if (!keyText) return theme.fg("muted", description);
  return theme.fg("dim", keyText) + theme.fg("muted", ` ${description}`);
}

export function hiddenPreviewExpandLabel(theme: Theme): string {
  return themedKeyHint(theme, "app.tools.expand", "expand");
}

export function hiddenPreviewExpandHint(theme: Theme): string {
  return `${theme.fg("muted", "╰─ ")}${hiddenPreviewExpandLabel(theme)}`;
}

export function showingFooter(theme: Theme, shown: number, total: number, label: string): string {
  return previewFooter(
    theme,
    `Showing ${shown} of ${total} ${label} · ${themedKeyHint(theme, "app.tools.expand", "expand")}`,
  );
}

function formatKeys(keys: string[]): string {
  return keys.join("/");
}

function countTrimmedTextLines(text: string): number {
  let total = 0;
  let pendingEmpty = 0;
  forEachRawTextLine(text, (line) => {
    if (line === "") pendingEmpty++;
    else {
      total += pendingEmpty + 1;
      pendingEmpty = 0;
    }
  });
  return total;
}

function forEachTrimmedTextLine(
  text: string,
  callback: (line: string, index: number) => void,
): void {
  let index = 0;
  let pendingEmpty = 0;
  forEachRawTextLine(text, (line) => {
    if (line === "") {
      pendingEmpty++;
      return;
    }
    while (pendingEmpty > 0) {
      callback("", index++);
      pendingEmpty--;
    }
    callback(line, index++);
  });
}

export function previewFooter(theme: Theme, text: string): string {
  return `\n${theme.fg("muted", `╰─ ${text}`)}`;
}
