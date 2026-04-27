import type { Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";
import { diffWords } from "diff";
import { codePreviewSettings } from "./settings.js";
import { renderWithShiki } from "./shiki.js";

const DIFF_ADD_MARKER = "\u0000PI_DIFF_ADD\u0000";
const DIFF_REMOVE_MARKER = "\u0000PI_DIFF_REMOVE\u0000";

export class FullWidthDiffText implements Component {
	constructor(private readonly text: string, private readonly theme?: Theme) {}

	render(width: number): string[] {
		return this.text.split("\n").map((rawLine) => {
			const kind = rawLine.startsWith(DIFF_ADD_MARKER)
				? "add"
				: rawLine.startsWith(DIFF_REMOVE_MARKER)
					? "remove"
					: undefined;
			const line = kind === "add"
				? rawLine.slice(DIFF_ADD_MARKER.length)
				: kind === "remove"
					? rawLine.slice(DIFF_REMOVE_MARKER.length)
					: rawLine;

			if (!kind) return truncateToWidth(line, width, "");

			const truncated = truncateToWidth(line, width, "");
			const padding = " ".repeat(Math.max(0, width - visibleWidth(truncated)));
			return diffLineBg(kind, truncated + padding, this.theme);
		});
	}

	invalidate(): void {}
}

export function summarizeDiff(diff: string): {
	additions: number;
	removals: number;
	replacements: number;
	insertions: number;
	deletions: number;
	totalLines: number;
	hunks: number;
} {
	let additions = 0;
	let removals = 0;
	let replacements = 0;
	let insertions = 0;
	let deletions = 0;
	let hunks = 0;
	let groupAdditions = 0;
	let groupRemovals = 0;
	const lines = diff.split("\n");

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

	for (const line of lines) {
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
	}
	flushChangeGroup();

	return { additions, removals, replacements, insertions, deletions, totalLines: lines.length, hunks };
}

export function renderSyntaxHighlightedDiff(diff: string, lang: string | undefined, theme: Theme, limit: number, invalidate?: () => void): string {
	const lines = diff.split("\n");
	const out: string[] = [];

	for (let i = 0; i < Math.min(lines.length, limit); i++) {
		const line = lines[i]!;
		const parsed = parseDiffLine(line);
		if (!parsed) {
			out.push(renderSeparator(line, theme));
			continue;
		}

		if (isRemovedDiffLine(parsed) && i + 1 < lines.length) {
			const next = parseDiffLine(lines[i + 1]!);
			if (isAddedDiffLine(next)) {
				const pair = renderChangedPair(parsed, next, lang, theme, invalidate);
				out.push(pair.removed, pair.added);
				i++;
				continue;
			}
		}

		out.push(renderDiffParsedLine(parsed, lang, theme, invalidate));
	}

	return out.join("\n");
}

function renderSeparator(line: string, theme: Theme): string {
	const trimmed = line.trim();
	if (trimmed === "...") return theme.fg("muted", "      --- unchanged lines hidden ---");
	if (trimmed.startsWith("@@")) return theme.fg("accent", theme.bold(line));
	if (trimmed.startsWith("---") || trimmed.startsWith("+++")) return theme.fg("muted", line);
	if (trimmed.startsWith("diff ") || trimmed.startsWith("index ")) return theme.fg("muted", line);
	return theme.fg("toolDiffContext", line);
}

function renderDiffParsedLine(
	parsed: ParsedDiffLine,
	lang: string | undefined,
	theme: Theme,
	invalidate?: () => void,
): string {
	const highlighted = highlightSingleLine(parsed.content.replace(/\t/g, "   "), lang, theme, invalidate);
	if (parsed.kind === "+") return `${DIFF_ADD_MARKER}${theme.fg("toolDiffAdded", `+${parsed.lineNumber} │ `)}${highlighted}`;
	if (parsed.kind === "-") return `${DIFF_REMOVE_MARKER}${theme.fg("toolDiffRemoved", `-${parsed.lineNumber} │ `)}${highlighted}`;
	return dimAnsi(`${theme.fg("toolDiffContext", ` ${parsed.lineNumber} │ `)}${highlighted || theme.fg("toolDiffContext", "")}`);
}

function renderChangedPair(
	removed: RemovedDiffLine,
	added: AddedDiffLine,
	lang: string | undefined,
	theme: Theme,
	invalidate?: () => void,
): { removed: string; added: string } {
	const removedLine = renderDiffParsedLine(removed, lang, theme, invalidate);
	const addedLine = renderDiffParsedLine(added, lang, theme, invalidate);
	// Compute ranges against the same tab-normalized text that Shiki renders.
	// Otherwise files indented with tabs shift the emphasis range by multiple cells.
	const ranges = changedRanges(normalizeDiffContent(removed.content), normalizeDiffContent(added.content));
	return {
		removed: emphasizeChangedSpans(removedLine, ranges.removed, "remove"),
		added: emphasizeChangedSpans(addedLine, ranges.added, "add"),
	};
}

function dimAnsi(text: string): string {
	return `\x1b[2m${text}\x1b[22m`;
}

function diffLineBg(kind: "add" | "remove", line: string, theme?: Theme): string {
	// Full-width subtle backgrounds for changed lines. Re-apply after foreground
	// resets emitted by Shiki so token coloring does not punch holes in the bg.
	if (codePreviewSettings.diffIntensity === "off") return line;
	const bg = deriveDiffBg(kind, theme, codePreviewSettings.diffIntensity === "medium" ? 0.24 : 0.14)
		?? (kind === "add"
			? codePreviewSettings.diffIntensity === "medium" ? "\x1b[48;2;22;68;40m" : "\x1b[48;2;10;42;26m"
			: codePreviewSettings.diffIntensity === "medium" ? "\x1b[48;2;78;36;40m" : "\x1b[48;2;50;24;30m");
	return bg + line.replace(/\x1b\[39m/g, `\x1b[39m${bg}`).replace(/\x1b\[49m/g, `\x1b[49m${bg}`) + "\x1b[49m";
}

function deriveDiffBg(kind: "add" | "remove", theme: Theme | undefined, intensity: number): string | undefined {
	const themed = theme as Theme & { getFgAnsi?: (key: string) => string; getBgAnsi?: (key: string) => string } | undefined;
	const fg = themed?.getFgAnsi?.(kind === "add" ? "toolDiffAdded" : "toolDiffRemoved");
	const fgRgb = parseAnsiRgb(fg ?? "");
	if (!fgRgb) return undefined;
	const base = parseAnsiRgb(themed?.getBgAnsi?.(kind === "add" ? "toolSuccessBg" : "toolErrorBg") ?? "")
		?? parseAnsiRgb(themed?.getBgAnsi?.("toolSuccessBg") ?? "")
		?? { r: 0, g: 0, b: 0 };
	return `\x1b[48;2;${Math.round(base.r + (fgRgb.r - base.r) * intensity)};${Math.round(base.g + (fgRgb.g - base.g) * intensity)};${Math.round(base.b + (fgRgb.b - base.b) * intensity)}m`;
}

function parseAnsiRgb(ansi: string): { r: number; g: number; b: number } | undefined {
	const match = ansi.match(/\x1b\[(?:38|48);2;(\d+);(\d+);(\d+)m/);
	if (!match) return undefined;
	return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function changedRanges(before: string, after: string): { removed: Array<[number, number]>; added: Array<[number, number]> } {
	const removed: Array<[number, number]> = [];
	const added: Array<[number, number]> = [];
	let oldIndex = 0;
	let newIndex = 0;
	for (const part of diffWords(before, after)) {
		const length = part.value.length;
		if (part.removed) {
			removed.push([oldIndex, oldIndex + length]);
			oldIndex += length;
		} else if (part.added) {
			added.push([newIndex, newIndex + length]);
			newIndex += length;
		} else {
			oldIndex += length;
			newIndex += length;
		}
	}
	return { removed: mergeNearbyRanges(removed), added: mergeNearbyRanges(added) };
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

function normalizeDiffContent(content: string): string {
	return content.replace(/\t/g, "   ");
}

function emphasizeChangedSpans(line: string, ranges: Array<[number, number]>, kind: "add" | "remove"): string {
	if (ranges.length === 0) return line;
	const codeStart = findCodeStart(line);
	return line.slice(0, codeStart) + injectVisibleRangeEmphasis(line.slice(codeStart), ranges, wordEmphasis(kind));
}

function findCodeStart(line: string): number {
	const pipe = line.indexOf("│ ");
	if (pipe < 0) return 0;
	let index = pipe + "│ ".length;
	// Skip foreground resets emitted by theme.fg() around the gutter. These do not
	// correspond to visible code cells and should not count toward changed ranges.
	while (line[index] === "\x1b") {
		const end = line.indexOf("m", index);
		if (end < 0) break;
		index = end + 1;
	}
	return index;
}

function wordEmphasis(kind: "add" | "remove"): string {
	// Use a strong bg + bold so word emphasis remains visible after the full-line
	// diff background is re-applied in FullWidthDiffText.render().
	return kind === "add" ? "\x1b[48;2;64;132;82m\x1b[1m" : "\x1b[48;2;148;62;70m\x1b[1m";
}

function injectVisibleRangeEmphasis(ansi: string, ranges: Array<[number, number]>, open: string): string {
	let visible = 0;
	let rangeIndex = 0;
	let out = "";
	let active = false;
	for (let i = 0; i < ansi.length; i++) {
		const range = ranges[rangeIndex];
		if (ansi[i] === "\x1b") {
			const end = ansi.indexOf("m", i);
			if (end >= 0) {
				const seq = ansi.slice(i, end + 1);
				out += active && (seq === "\x1b[39m" || seq === "\x1b[22m") ? `${seq}${open}` : seq;
				i = end;
				continue;
			}
		}
		if (!active && range && visible === range[0]) {
			out += open;
			active = true;
		}
		if (active && range && visible === range[1]) {
			out += "\x1b[22m\x1b[49m";
			active = false;
			rangeIndex++;
		}
		out += ansi[i];
		visible++;
	}
	if (active) out += "\x1b[22m\x1b[49m";
	return out;
}

type ParsedDiffLine = { kind: "+" | "-" | " "; lineNumber: string; content: string };

type AddedDiffLine = ParsedDiffLine & { kind: "+" };
type RemovedDiffLine = ParsedDiffLine & { kind: "-" };

function parseDiffLine(line: string): ParsedDiffLine | null {
	const match = line.match(/^([+\- ])(\s*\d*)\s(.*)$/);
	if (!match) return null;
	const kind = match[1];
	if (kind !== "+" && kind !== "-" && kind !== " ") return null;
	return { kind, lineNumber: match[2] ?? "", content: match[3] ?? "" };
}

function isAddedDiffLine(line: ParsedDiffLine | null): line is AddedDiffLine {
	return line?.kind === "+";
}

function isRemovedDiffLine(line: ParsedDiffLine | null): line is RemovedDiffLine {
	return line?.kind === "-";
}

function highlightSingleLine(line: string, lang: string | undefined, theme: Theme, invalidate?: () => void): string {
	return renderWithShiki(line, lang, invalidate)?.[0] ?? theme.fg("toolOutput", line);
}
