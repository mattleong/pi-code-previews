import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createReadToolDefinition, getLanguageFromPath } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { getPathArg, getReadStartLine, getTextContent, isTruncated } from "../data.js";
import { metadata, previewFooter, showingFooter, trimTrailingEmptyLines } from "../format.js";
import { resolvePreviewLanguage } from "../language.js";
import { renderDisplayPath } from "../paths.js";
import { codePreviewSettings } from "../settings.js";
import { normalizeShikiLanguage, shouldSkipHighlight } from "../shiki.js";
import { escapeControlChars } from "../terminal-text.js";
import { renderHighlightedPreviewLines, withSecretWarning } from "./common.js";

export function registerRead(pi: ExtensionAPI, cwd: string) {
	const originalRead = createReadToolDefinition(cwd);

	pi.registerTool({
		...originalRead,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalRead.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme, _context) {
			const path = getPathArg(args);
			const lang = resolvePreviewLanguage({ path, piLanguage: getLanguageFromPath(path) });
			let text = `${theme.fg("toolTitle", theme.bold("read"))} ${renderDisplayPath(path, cwd, theme)}`;
			if (typeof args.offset === "number" || typeof args.limit === "number") {
				const start = typeof args.offset === "number" ? args.offset : 1;
				const end = typeof args.limit === "number" ? start + args.limit - 1 : undefined;
				text += theme.fg("warning", `:${start}${end ? `-${end}` : ""}`);
			}
			text += metadata(theme, [lang ? normalizeShikiLanguage(lang) : undefined]);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Reading…"), 0, 0);
			const firstText = getTextContent(result.content);
			if (context.isError) {
				return new Text(theme.fg("error", escapeControlChars(firstText.split("\n")[0] || "Read failed")), 0, 0);
			}

			const path = getPathArg(context.args);

			// Pi already renders image content parts natively. Avoid emitting terminal image
			// escape sequences here; show only a compact note beside Pi's image renderer.
			if (result.content?.some((part) => part.type === "image")) {
				return new Text(theme.fg("dim", escapeControlChars(firstText.replace(/^Read image file/i, "image"))), 0, 0);
			}

			const lang = resolvePreviewLanguage({ path, content: firstText, piLanguage: getLanguageFromPath(path) });
			const firstLine = getReadStartLine(context.args);
			const rawLines = trimTrailingEmptyLines(firstText.replace(/\t/g, "   ").split("\n"));
			const limit = expanded ? rawLines.length : codePreviewSettings.readCollapsedLines;
			const skipHighlight = shouldSkipHighlight(firstText);
			const preview = renderHighlightedPreviewLines(rawLines, limit, skipHighlight ? undefined : lang, theme, context.invalidate, {
				firstLine,
				lineNumberWidth: String(firstLine + Math.max(0, rawLines.length - 1)).length,
			});

			let text = preview.lines.length ? withSecretWarning(firstText, theme, preview.lines.join("\n")) : theme.fg("muted", "Empty file");
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, rawLines.length, "lines");

			if (skipHighlight) text += previewFooter(theme, "Syntax highlighting skipped for large file");
			if (isTruncated(result.details)) text += previewFooter(theme, "Output truncated by read");
			return new Text(text, 0, 0);
		},
	});
}
