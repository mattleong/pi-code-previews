import type { Theme } from "@mariozechner/pi-coding-agent";
import { keyHint } from "@mariozechner/pi-coding-agent";

export type PreviewLineEntry<T> =
	| { kind: "line"; line: T; index: number }
	| { kind: "hidden"; hidden: number };

export function selectPreviewLines<T>(lines: T[], limit: number): { entries: Array<PreviewLineEntry<T>>; shown: number; hidden: number } {
	if (lines.length <= limit || limit <= 0) {
		return { entries: lines.map((line, index) => ({ kind: "line", line, index })), shown: lines.length, hidden: 0 };
	}
	if (limit < 8) {
		return {
			entries: lines.slice(0, limit).map((line, index) => ({ kind: "line", line, index })),
			shown: limit,
			hidden: lines.length - limit,
		};
	}
	const head = Math.ceil(limit * 0.65);
	const tail = Math.max(1, limit - head - 1);
	const hidden = lines.length - head - tail;
	return {
		entries: [
			...lines.slice(0, head).map((line, index) => ({ kind: "line" as const, line, index })),
			{ kind: "hidden", hidden },
			...lines.slice(lines.length - tail).map((line, offset) => ({ kind: "line" as const, line, index: lines.length - tail + offset })),
		],
		shown: head + tail,
		hidden,
	};
}

export function previewLines(lines: string[], limit: number, theme: Theme): { lines: string[]; shown: number; hidden: number } {
	const preview = selectPreviewLines(lines, limit);
	return {
		lines: preview.entries.map((entry) => entry.kind === "hidden" ? hiddenLinesMarker(theme, entry.hidden) : entry.line),
		shown: preview.shown,
		hidden: preview.hidden,
	};
}

export function selectPreviewTextLines(text: string, limit: number): { entries: Array<PreviewLineEntry<string>>; shown: number; hidden: number; total: number } {
	const total = countTrimmedTextLines(text);
	if (total === 0) return { entries: [], shown: 0, hidden: 0, total: 0 };
	if (total <= limit || limit <= 0) {
		const entries: Array<PreviewLineEntry<string>> = [];
		forEachTrimmedTextLine(text, (line, index) => entries.push({ kind: "line", line, index }));
		return { entries, shown: total, hidden: 0, total };
	}
	if (limit < 8) {
		const entries: Array<PreviewLineEntry<string>> = [];
		forEachTrimmedTextLine(text, (line, index) => {
			if (index < limit) entries.push({ kind: "line", line, index });
		});
		return { entries, shown: limit, hidden: total - limit, total };
	}
	const head = Math.ceil(limit * 0.65);
	const tail = Math.max(1, limit - head - 1);
	const tailStart = total - tail;
	const hidden = total - head - tail;
	const entries: Array<PreviewLineEntry<string>> = [];
	let markerAdded = false;
	forEachTrimmedTextLine(text, (line, index) => {
		if (index < head) {
			entries.push({ kind: "line", line, index });
			return;
		}
		if (index >= tailStart) {
			if (!markerAdded) {
				entries.push({ kind: "hidden", hidden });
				markerAdded = true;
			}
			entries.push({ kind: "line", line, index });
		}
	});
	return { entries, shown: head + tail, hidden, total };
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

export function showingFooter(theme: Theme, shown: number, total: number, label: string): string {
	return previewFooter(theme, `Showing ${shown} of ${total} ${label} · ${keyHint("app.tools.expand", "expand")}`);
}

export function trimTrailingEmptyLines(lines: string[]): string[] {
	let end = lines.length;
	while (end > 0 && lines[end - 1] === "") end--;
	return lines.slice(0, end);
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

function forEachTrimmedTextLine(text: string, callback: (line: string, index: number) => void): void {
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

function forEachRawTextLine(text: string, callback: (line: string) => void): void {
	let start = 0;
	while (start <= text.length) {
		const newline = text.indexOf("\n", start);
		if (newline < 0) {
			callback(text.slice(start));
			break;
		}
		callback(text.slice(start, newline));
		start = newline + 1;
	}
}

export function previewFooter(theme: Theme, text: string): string {
	return `\n${theme.fg("muted", `╰─ ${text}`)}`;
}
