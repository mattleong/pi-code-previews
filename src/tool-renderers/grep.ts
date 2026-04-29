import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createGrepToolDefinition } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { getTextContent } from "../data.js";
import { metadata, previewFooter, showingFooter, trimSingleTrailingNewline } from "../format.js";
import { renderGrepOutputLines } from "../grep-rendering.js";
import { renderDisplayPath } from "../paths.js";
import { codePreviewSettings } from "../settings.js";
import { shouldSkipHighlight } from "../shiki.js";
import { escapeControlChars } from "../terminal-text.js";
import { renderSelectedOutputLines } from "./common.js";

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
