import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { countLabel, hiddenLinesMarker, selectPreviewLines } from "../format.js";
import { hashString } from "../hash.js";
import { getSecretWarnings } from "../secret-warnings.js";
import { codePreviewSettings } from "../settings.js";
import { renderHighlightedText } from "../shiki.js";
import { escapeControlChars } from "../terminal-text.js";

export function withSecretWarning(source: string, theme: Theme, preview: string): string {
	if (!codePreviewSettings.secretWarnings) return preview;
	const warnings = getSecretWarnings(source);
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
	lineNumbers?: { firstLine: number; lineNumberWidth: number },
): { lines: string[]; shown: number; hidden: number } {
	const preview = selectPreviewLines(rawLines, limit);
	const lines: string[] = [];
	let chunk: Array<{ line: string; index: number }> = [];

	function flushChunk(): void {
		if (chunk.length === 0) return;
		const highlighted = renderHighlightedText(chunk.map((entry) => entry.line).join("\n"), lang, theme, invalidate);
		for (let index = 0; index < chunk.length; index++) {
			const rendered = highlighted[index] ?? theme.fg("toolOutput", escapeControlChars(chunk[index]!.line));
			if (!lineNumbers || !codePreviewSettings.readLineNumbers) {
				lines.push(rendered);
				continue;
			}
			const lineNumber = String(lineNumbers.firstLine + chunk[index]!.index).padStart(lineNumbers.lineNumberWidth, " ");
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
