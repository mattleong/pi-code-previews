import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { createFindToolDefinition, createGrepToolDefinition, createLsToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { getTextContent } from "./data.js";
import { hiddenLinesMarker, metadata, previewFooter, selectPreviewLines, showingFooter, trimSingleTrailingNewline } from "./format.js";
import { renderGrepOutputLines } from "./grep-rendering.js";
import { renderPathListLines } from "./path-list-rendering.js";
import { renderDisplayPath } from "./paths.js";
import { codePreviewSettings } from "./settings.js";
import { shouldSkipHighlight } from "./shiki.js";
import { escapeControlChars } from "./terminal-text.js";

export function registerGrep(pi: ExtensionAPI, cwd: string) {
	const originalGrep = createGrepToolDefinition(cwd);

	pi.registerTool({
		...originalGrep,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalGrep.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme) {
			const pattern = typeof args.pattern === "string" ? args.pattern : "";
			const path = typeof args.path === "string" && args.path ? args.path : ".";
			const glob = typeof args.glob === "string" && args.glob ? args.glob : undefined;
			const limit = typeof args.limit === "number" ? args.limit : undefined;
			let text = `${theme.fg("toolTitle", theme.bold("grep"))} ${theme.fg("accent", `/${escapeControlChars(pattern)}/`)} ${theme.fg("muted", "in")} ${renderDisplayPath(path, cwd, theme)}`;
			text += metadata(theme, [glob ? escapeControlChars(glob) : undefined, limit ? `limit ${limit}` : undefined]);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Searching…"), 0, 0);
			const output = trimSingleTrailingNewline(getTextContent(result.content));
			if (context.isError) {
				return new Text(theme.fg("error", escapeControlChars(output.split("\n")[0] || "Grep failed")), 0, 0);
			}
			if (!output || output === "No matches found") return new Text(theme.fg("muted", output || "No matches found"), 0, 0);

			const pattern = typeof context.args?.pattern === "string" ? context.args.pattern : "";
			const rawLines = output.split("\n");
			const limit = expanded ? rawLines.length : codePreviewSettings.grepCollapsedLines;
			const skipHighlight = shouldSkipHighlight(output);
			const preview = renderSelectedOutputLines(rawLines, limit, theme, (chunk) => renderGrepOutputLines(chunk.join("\n"), theme, {
				pattern,
				literal: context.args?.literal === true,
				ignoreCase: context.args?.ignoreCase === true,
			}, context.invalidate, { syntaxHighlight: !skipHighlight }));
			let text = preview.lines.join("\n");
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, rawLines.length, "grep output lines");
			if (skipHighlight) text += previewFooter(theme, "Syntax highlighting skipped for large grep output");
			return new Text(text, 0, 0);
		},
	});
}

export function registerFind(pi: ExtensionAPI, cwd: string) {
	const originalFind = createFindToolDefinition(cwd);
	pi.registerTool({
		...originalFind,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalFind.execute(toolCallId, params, signal, onUpdate, ctx);
		},
		renderCall(args, theme) {
			const pattern = typeof args.pattern === "string" ? args.pattern : "";
			const path = typeof args.path === "string" && args.path ? args.path : ".";
			return new Text(`${theme.fg("toolTitle", theme.bold("find"))} ${theme.fg("accent", escapeControlChars(pattern || "*"))} ${theme.fg("muted", "in")} ${renderDisplayPath(path, cwd, theme)}`, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Finding…"), 0, 0);
			const output = trimSingleTrailingNewline(getTextContent(result.content));
			if (context.isError) return new Text(theme.fg("error", escapeControlChars(output.split("\n")[0] || "Find failed")), 0, 0);
			if (!output || output === "No files found matching pattern") return new Text(theme.fg("muted", output || "No files found"), 0, 0);
			const rawLines = output.split("\n");
			const limit = expanded ? rawLines.length : codePreviewSettings.pathListCollapsedLines;
			const preview = renderSelectedOutputLines(rawLines, limit, theme, (chunk) => renderPathListLines(chunk.join("\n"), cwd, theme));
			let text = preview.lines.join("\n");
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, rawLines.length, "paths");
			return new Text(text, 0, 0);
		},
	});
}

export function registerLs(pi: ExtensionAPI, cwd: string) {
	const originalLs = createLsToolDefinition(cwd);
	pi.registerTool({
		...originalLs,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalLs.execute(toolCallId, params, signal, onUpdate, ctx);
		},
		renderCall(args, theme) {
			const path = typeof args.path === "string" && args.path ? args.path : ".";
			return new Text(`${theme.fg("toolTitle", theme.bold("ls"))} ${renderDisplayPath(path, cwd, theme)}`, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Listing…"), 0, 0);
			const output = trimSingleTrailingNewline(getTextContent(result.content));
			if (context.isError) return new Text(theme.fg("error", escapeControlChars(output.split("\n")[0] || "List failed")), 0, 0);
			if (!output || output === "(empty directory)") return new Text(theme.fg("muted", "Empty directory"), 0, 0);
			const rawLines = output.split("\n");
			const limit = expanded ? rawLines.length : codePreviewSettings.pathListCollapsedLines;
			const preview = renderSelectedOutputLines(rawLines, limit, theme, (chunk) => renderPathListLines(chunk.join("\n"), cwd, theme));
			let text = preview.lines.join("\n");
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, rawLines.length, "entries");
			return new Text(text, 0, 0);
		},
	});
}

function renderSelectedOutputLines(rawLines: string[], limit: number, theme: Theme, renderChunk: (chunk: string[]) => string[]): { lines: string[]; shown: number; hidden: number } {
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
