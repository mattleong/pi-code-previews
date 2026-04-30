import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { countLabel, hiddenLinesMarker, selectPreviewLines, selectPreviewTextLines } from "../format.js";
import { hashString } from "../hash.js";
import { getSecretWarnings } from "../secret-warnings.js";
import { codePreviewSettings } from "../settings.js";
import { renderHighlightedText } from "../shiki.js";
import { escapeControlChars } from "../terminal-text.js";

const SECRET_SCAN_CHARS = positiveEnvInteger("CODE_PREVIEW_SECRET_SCAN_CHARS", 200_000);

export function withSecretWarning(source: string, theme: Theme, preview: string): string {
	if (!codePreviewSettings.secretWarnings) return preview;
	const warnings = getSecretWarnings(secretScanSample(source));
	if (warnings.length === 0) return preview;
	return `${theme.fg("warning", `⚠ Preview ${countLabel(warnings.length, "warning")}: possible ${warnings.join(", ")}`)}\n${preview}`;
}

export function countFileLines(content: string): number {
	if (!content) return 0;
	const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const withoutFinalTerminator = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
	return withoutFinalTerminator.split("\n").length;
}

export function renderHighlightedPreviewLines(
	rawLines: string[],
	limit: number,
	lang: string | undefined,
	theme: Theme,
	invalidate?: () => void,
	lineNumbers?: { firstLine: number; lineNumberWidth?: number },
): { lines: string[]; shown: number; hidden: number } {
	return renderHighlightedPreviewEntries(selectPreviewLines(rawLines, limit), lang, theme, invalidate, lineNumbers);
}

export function renderHighlightedPreviewText(
	text: string,
	limit: number,
	lang: string | undefined,
	theme: Theme,
	invalidate?: () => void,
	lineNumbers?: { firstLine: number; lineNumberWidth?: number },
): { lines: string[]; shown: number; hidden: number; total: number } {
	const preview = selectPreviewTextLines(text, limit);
	const numbered = lineNumbers
		? { ...lineNumbers, lineNumberWidth: lineNumbers.lineNumberWidth ?? String(lineNumbers.firstLine + Math.max(0, preview.total - 1)).length }
		: undefined;
	return { ...renderHighlightedPreviewEntries(preview, lang, theme, invalidate, numbered), total: preview.total };
}

function renderHighlightedPreviewEntries(
	preview: { entries: ReturnType<typeof selectPreviewLines<string>>["entries"]; shown: number; hidden: number },
	lang: string | undefined,
	theme: Theme,
	invalidate?: () => void,
	lineNumbers?: { firstLine: number; lineNumberWidth?: number },
): { lines: string[]; shown: number; hidden: number } {
	const lines: string[] = [];
	let chunk: Array<{ line: string; index: number }> = [];

	function flushChunk(): void {
		if (chunk.length === 0) return;
		const normalizedChunk = chunk.map((entry) => entry.line.replace(/\t/g, "   "));
		const highlighted = renderHighlightedText(normalizedChunk.join("\n"), lang, theme, invalidate);
		for (let index = 0; index < chunk.length; index++) {
			const rendered = highlighted[index] ?? theme.fg("toolOutput", escapeControlChars(normalizedChunk[index] ?? ""));
			if (!lineNumbers || !codePreviewSettings.readLineNumbers) {
				lines.push(rendered);
				continue;
			}
			const width = lineNumbers.lineNumberWidth ?? String(lineNumbers.firstLine + chunk[index]!.index).length;
			const lineNumber = String(lineNumbers.firstLine + chunk[index]!.index).padStart(width, " ");
			lines.push(`${theme.fg("dim", `${lineNumber} │ `)}${rendered}`);
		}
		chunk = [];
	}

	for (const entry of preview.entries) {
		if (entry.kind === "hidden") {
			flushChunk();
			lines.push(hiddenLinesMarker(theme, entry.hidden));
		} else {
			chunk.push({ line: entry.line, index: entry.index });
		}
	}
	flushChunk();
	return { lines, shown: preview.shown, hidden: preview.hidden };
}

export function renderSelectedOutputLines(rawLines: string[], limit: number, theme: Theme, renderChunk: (chunk: string[]) => string[]): { lines: string[]; shown: number; hidden: number } {
	const preview = selectPreviewLines(rawLines, limit);
	const lines: string[] = [];
	let chunk: string[] = [];

	function flushChunk(): void {
		if (chunk.length === 0) return;
		lines.push(...renderChunk(chunk));
		chunk = [];
	}

	for (const entry of preview.entries) {
		if (entry.kind === "hidden") {
			flushChunk();
			lines.push(hiddenLinesMarker(theme, entry.hidden));
		} else {
			chunk.push(entry.line);
		}
	}
	flushChunk();
	return { lines, shown: preview.shown, hidden: preview.hidden };
}

export function cachedPreview(
	state: Record<string, unknown>,
	keyName: string,
	componentName: string,
	key: string,
	create: () => Component,
): Component {
	const cached = state[componentName];
	if (state[keyName] !== key || !cached || typeof (cached as Component).render !== "function") {
		state[keyName] = key;
		state[componentName] = create();
	}
	return state[componentName] as Component;
}

export function previewCacheKey(kind: string, source: string, path: string, expanded: boolean, theme: Theme): string {
	return [
		kind,
		path,
		expanded ? "expanded" : "collapsed",
		codePreviewSettings.shikiTheme,
		codePreviewSettings.syntaxHighlighting ? "syntax" : "plain",
		codePreviewSettings.diffIntensity,
		String(codePreviewSettings.editCollapsedLines),
		(theme as Theme & { name?: string }).name ?? "",
		source.length,
		hashString(source),
	].join("\0");
}

export function previewArgsKey(kind: string, source: string, path: string): string {
	return [kind, path, source.length, hashString(source)].join("\0");
}

function secretScanSample(source: string): string {
	if (source.length <= SECRET_SCAN_CHARS) return source;
	const half = Math.floor(SECRET_SCAN_CHARS / 2);
	return `${source.slice(0, half)}\n${source.slice(-half)}`;
}

function positiveEnvInteger(name: string, fallback: number): number {
	const value = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}
