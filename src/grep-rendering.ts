import type { Theme } from "@mariozechner/pi-coding-agent";
import { getLanguageFromPath } from "@mariozechner/pi-coding-agent";
import { resolvePreviewLanguage } from "./language.js";
import { renderHighlightedText } from "./shiki.js";

export type ParsedGrepOutputLine = { path: string; lineNumber: string; code: string; kind: "match" | "context" };

export function renderGrepOutputLines(output: string, theme: Theme, search: { pattern: string; literal: boolean; ignoreCase: boolean }, invalidate?: () => void): string[] {
	const rendered: string[] = [];
	let currentPath = "";
	for (const rawLine of output.split("\n")) {
		if (!rawLine) {
			rendered.push("");
			continue;
		}
		if (rawLine.startsWith("[") && rawLine.endsWith("]")) {
			rendered.push(theme.fg("warning", rawLine));
			continue;
		}
		const parsed = parseGrepOutputLine(rawLine);
		if (!parsed) {
			rendered.push(theme.fg("toolOutput", rawLine));
			continue;
		}
		if (parsed.path !== currentPath) {
			currentPath = parsed.path;
			rendered.push(theme.fg("accent", currentPath));
		}
		rendered.push(renderGrepParsedLine(parsed, theme, search, invalidate));
	}
	return rendered;
}

export function parseGrepOutputLine(line: string): ParsedGrepOutputLine | undefined {
	const matchLine = line.match(/^(.+):(\d+):\s(.*)$/);
	if (matchLine) {
		return { path: matchLine[1] ?? "", lineNumber: matchLine[2] ?? "", code: matchLine[3] ?? "", kind: "match" };
	}
	const contextLine = line.match(/^(.+)-(\d+)-\s(.*)$/);
	if (contextLine) {
		return { path: contextLine[1] ?? "", lineNumber: contextLine[2] ?? "", code: contextLine[3] ?? "", kind: "context" };
	}
	return undefined;
}

function renderGrepParsedLine(parsed: ParsedGrepOutputLine, theme: Theme, search: { pattern: string; literal: boolean; ignoreCase: boolean }, invalidate?: () => void): string {
	const lang = resolvePreviewLanguage({ path: parsed.path, piLanguage: getLanguageFromPath(parsed.path) });
	const code = parsed.code.replace(/\t/g, "   ");
	let highlighted = renderHighlightedText(code, lang, theme, invalidate)[0] ?? theme.fg("toolOutput", code);
	const matchRanges = parsed.kind === "match" ? grepMatchRanges(code, search) : [];
	if (matchRanges.length > 0) highlighted = injectVisibleRangesBg(highlighted, matchRanges, "\x1b[48;2;90;74;28m", getToolBackground(theme));
	const paddedLineNumber = parsed.lineNumber.padStart(4);
	const lineNumber = parsed.kind === "match" ? theme.fg("accent", paddedLineNumber) : theme.fg("dim", paddedLineNumber);
	const marker = parsed.kind === "match" ? theme.fg("warning", "│") : theme.fg("dim", "┆");
	return `${theme.fg("dim", "  ")}${lineNumber} ${marker} ${highlighted}`;
}

function grepMatchRanges(code: string, search: { pattern: string; literal: boolean; ignoreCase: boolean }): Array<[number, number]> {
	if (!search.pattern) return [];
	if (search.literal) {
		const haystack = search.ignoreCase ? code.toLowerCase() : code;
		const needle = search.ignoreCase ? search.pattern.toLowerCase() : search.pattern;
		if (!needle) return [];
		const ranges: Array<[number, number]> = [];
		let index = haystack.indexOf(needle);
		while (index >= 0) {
			ranges.push([index, index + needle.length]);
			index = haystack.indexOf(needle, index + Math.max(1, needle.length));
		}
		return ranges;
	}
	try {
		const ranges: Array<[number, number]> = [];
		const flags = `${search.ignoreCase ? "i" : ""}g`;
		const regex = new RegExp(search.pattern, flags);
		for (const match of code.matchAll(regex)) {
			if (match.index === undefined || match[0].length === 0) continue;
			ranges.push([match.index, match.index + match[0].length]);
		}
		return ranges;
	} catch {
		return [];
	}
}

function getToolBackground(theme: Theme): string {
	const themed = theme as Theme & { getBgAnsi?: (key: string) => string };
	try {
		return themed.getBgAnsi?.("toolSuccessBg") ?? "";
	} catch {
		return "";
	}
}

function injectVisibleRangesBg(ansi: string, ranges: Array<[number, number]>, bg: string, restoreBg: string): string {
	let visible = 0;
	let out = "";
	let active = false;
	let rangeIndex = 0;
	const sorted = ranges.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
	for (let i = 0; i < ansi.length; i++) {
		if (ansi[i] === "\x1b") {
			const end = ansi.indexOf("m", i);
			if (end >= 0) {
				const seq = ansi.slice(i, end + 1);
				out += active && seq === "\x1b[39m" ? `${seq}${bg}` : seq;
				i = end;
				continue;
			}
		}
		while (rangeIndex < sorted.length && visible >= sorted[rangeIndex]![1]) {
			if (active) {
				out += restoreBg || "\x1b[49m";
				active = false;
			}
			rangeIndex++;
		}
		const range = sorted[rangeIndex];
		if (!active && range && visible >= range[0] && visible < range[1]) {
			out += bg;
			active = true;
		}
		out += ansi[i];
		visible++;
	}
	if (active) out += restoreBg || "\x1b[49m";
	return out;
}
