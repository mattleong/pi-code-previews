import type { Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";
import { codePreviewSettings } from "./settings.js";
import { renderWithShiki } from "./shiki.js";

const DIFF_ADD_MARKER = "\u0000PI_DIFF_ADD\u0000";
const DIFF_REMOVE_MARKER = "\u0000PI_DIFF_REMOVE\u0000";

export class FullWidthDiffText implements Component {
	constructor(private readonly text: string) {}

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
			return diffLineBg(kind, truncated + padding);
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
	let hunks = 0;
	let inHunk = false;
	const lines = diff.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const isAddition = line.startsWith("+") && !line.startsWith("+++");
		const isRemoval = line.startsWith("-") && !line.startsWith("---");
		const changed = isAddition || isRemoval;

		if (isAddition) additions++;
		else if (isRemoval) {
			removals++;
			const next = lines[i + 1];
			if (next?.startsWith("+") && !next.startsWith("+++")) replacements++;
		}

		if (changed && !inHunk) hunks++;
		inHunk = changed;
	}

	return {
		additions,
		removals,
		replacements,
		insertions: Math.max(0, additions - replacements),
		deletions: Math.max(0, removals - replacements),
		totalLines: lines.length,
		hunks,
	};
}

export function renderSyntaxHighlightedDiff(diff: string, lang: string | undefined, theme: Theme, limit: number): string {
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
				const pair = renderChangedPair(parsed, next, lang, theme);
				out.push(pair.removed, pair.added);
				i++;
				continue;
			}
		}

		out.push(renderDiffParsedLine(parsed, lang, theme));
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
): string {
	const highlighted = highlightSingleLine(parsed.content.replace(/\t/g, "   "), lang, theme);
	if (parsed.kind === "+") return `${DIFF_ADD_MARKER}${theme.fg("toolDiffAdded", `+${parsed.lineNumber} │ `)}${highlighted}`;
	if (parsed.kind === "-") return `${DIFF_REMOVE_MARKER}${theme.fg("toolDiffRemoved", `-${parsed.lineNumber} │ `)}${highlighted}`;
	return dimAnsi(`${theme.fg("toolDiffContext", ` ${parsed.lineNumber} │ `)}${highlighted || theme.fg("toolDiffContext", "")}`);
}

function renderChangedPair(
	removed: RemovedDiffLine,
	added: AddedDiffLine,
	lang: string | undefined,
	theme: Theme,
): { removed: string; added: string } {
	// Keep paired replacements visually stable: full-line diff backgrounds +
	// Shiki syntax colors are readable, while nested word-level ANSI styling can
	// create terminal artifacts in narrow/truncated TUI rows.
	return {
		removed: renderDiffParsedLine(removed, lang, theme),
		added: renderDiffParsedLine(added, lang, theme),
	};
}

function dimAnsi(text: string): string {
	return `\x1b[2m${text}\x1b[22m`;
}

function diffLineBg(kind: "add" | "remove", line: string): string {
	// Full-width subtle backgrounds for changed lines. Re-apply after foreground
	// resets emitted by Shiki so token coloring does not punch holes in the bg.
	if (codePreviewSettings.diffIntensity === "off") return line;
	const bg = kind === "add"
		? codePreviewSettings.diffIntensity === "medium" ? "\x1b[48;2;22;68;40m" : "\x1b[48;2;10;42;26m"
		: codePreviewSettings.diffIntensity === "medium" ? "\x1b[48;2;78;36;40m" : "\x1b[48;2;50;24;30m";
	return bg + line.replace(/\x1b\[39m/g, `\x1b[39m${bg}`) + "\x1b[49m";
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

function highlightSingleLine(line: string, lang: string | undefined, theme: Theme): string {
	return renderWithShiki(line, lang)?.[0] ?? theme.fg("toolOutput", line);
}
