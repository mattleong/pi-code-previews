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
	const matchRange = parsed.kind === "match" ? grepMatchRange(code, search) : undefined;
	if (matchRange) highlighted = injectVisibleRangeBg(highlighted, matchRange, "\x1b[48;2;90;74;28m", getToolBackground(theme));
	const paddedLineNumber = parsed.lineNumber.padStart(4);
	const lineNumber = parsed.kind === "match" ? theme.fg("accent", paddedLineNumber) : theme.fg("dim", paddedLineNumber);
	const marker = parsed.kind === "match" ? theme.fg("warning", "│") : theme.fg("dim", "┆");
	return `${theme.fg("dim", "  ")}${lineNumber} ${marker} ${highlighted}`;
}

function grepMatchRange(code: string, search: { pattern: string; literal: boolean; ignoreCase: boolean }): [number, number] | undefined {
	if (!search.pattern) return undefined;
	if (search.literal) {
		const haystack = search.ignoreCase ? code.toLowerCase() : code;
		const needle = search.ignoreCase ? search.pattern.toLowerCase() : search.pattern;
		const index = haystack.indexOf(needle);
		return index >= 0 ? [index, index + needle.length] : undefined;
	}
	try {
		const match = new RegExp(search.pattern, search.ignoreCase ? "i" : "").exec(code);
		return match?.index !== undefined ? [match.index, match.index + match[0].length] : undefined;
	} catch {
		return undefined;
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

function injectVisibleRangeBg(ansi: string, range: [number, number], bg: string, restoreBg: string): string {
	let visible = 0;
	let out = "";
	let active = false;
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
		if (!active && visible === range[0]) {
			out += bg;
			active = true;
		}
		if (active && visible === range[1]) {
			out += restoreBg || "\x1b[49m";
			active = false;
		}
		out += ansi[i];
		visible++;
	}
	if (active) out += restoreBg || "\x1b[49m";
	return out;
}
