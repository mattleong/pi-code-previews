import type { AppKeybinding, Theme } from "@earendil-works/pi-coding-agent";
import { getKeybindings } from "@earendil-works/pi-tui";
import { countPreviewTextLines, forEachPreviewTextLine } from "./line-counts";

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
  return collectPreviewEntries(lines.length, limit, (push) => {
    lines.forEach((line, index) => push(line, index));
  });
}

function previewWindowPlan(total: number, limit: number): PreviewWindowPlan {
  if (total <= limit || limit <= 0) return { kind: "all", shown: total, hidden: 0 };
  if (limit < 8) return { kind: "head", shown: limit, hidden: total - limit };
  const head = Math.ceil(limit * 0.65);
  const tail = Math.max(1, limit - head - 1);
  return { kind: "split", head, tail, shown: head + tail, hidden: total - head - tail };
}

function collectPreviewEntries<T>(
  total: number,
  limit: number,
  visit: (push: (line: T, index: number) => void) => void,
): { entries: Array<PreviewLineEntry<T>>; shown: number; hidden: number } {
  const plan = previewWindowPlan(total, limit);
  const entries: Array<PreviewLineEntry<T>> = [];
  let markerAdded = false;
  const tailStart = plan.kind === "split" ? total - plan.tail : total;
  visit((line, index) => {
    if (plan.kind === "all" || (plan.kind === "head" && index < plan.shown)) {
      entries.push({ kind: "line", line, index });
      return;
    }
    if (plan.kind !== "split") return;
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
  return { entries, shown: plan.shown, hidden: plan.hidden };
}

export function selectPreviewTextLines(
  text: string,
  limit: number,
): { entries: Array<PreviewLineEntry<string>>; shown: number; hidden: number; total: number } {
  const total = countPreviewTextLines(text);
  return {
    ...collectPreviewEntries(total, limit, (push) => forEachPreviewTextLine(text, push)),
    total,
  };
}

export function hiddenLinesMarker(theme: Theme, hidden: number): string {
  return theme.fg("muted", `      --- ${hidden} lines hidden ---`);
}

export function trimSingleTrailingNewline(text: string): string {
  if (text.endsWith("\r\n")) return text.slice(0, -2);
  if (text.endsWith("\n")) return text.slice(0, -1);
  return text;
}

export function metadata(theme: Theme, parts: Array<string | undefined>): string {
  const present = parts.filter((part): part is string => Boolean(part));
  return present.length ? theme.fg("dim", ` · ${present.join(" · ")}`) : "";
}

function themedKeyHint(theme: Theme, keybinding: AppKeybinding, description: string): string {
  const keyText = getKeybindings().getKeys(keybinding).join("/");
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

export function previewFooter(theme: Theme, text: string): string {
  return `\n${theme.fg("muted", `╰─ ${text}`)}`;
}
