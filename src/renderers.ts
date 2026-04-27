import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition, getLanguageFromPath, keyHint } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { AsyncPreview, shouldRenderAsync } from "./async-preview.js";
import { getBashWarnings } from "./bash-warnings.js";
import { getEditDiff, getObjectValue, getPathArg, getReadStartLine, getTextContent, isTruncated } from "./data.js";
import { FullWidthDiffText, renderSyntaxHighlightedDiff, summarizeDiff } from "./diff.js";
import { countLabel, formatBytes, metadata, previewFooter, previewLines, showingFooter, trimTrailingEmptyLines } from "./format.js";
import { resolvePreviewLanguage } from "./language.js";
import { renderDisplayPath } from "./paths.js";
import { getSecretWarnings } from "./secret-warnings.js";
import { codePreviewSettings } from "./settings.js";
import { normalizeShikiLanguage, renderHighlightedText, shouldSkipHighlight } from "./shiki.js";
import { registerFind, registerGrep, registerLs } from "./search-renderers.js";
import { getEnabledCodePreviewTools } from "./tool-selection.js";
import { createSimpleDiff, getWriteDiffSkipReason, readExistingFileForPreview, shouldSkipWriteDiffText } from "./write-diff.js";

export function registerToolRenderers(pi: ExtensionAPI, cwd: string) {
	const enabledTools = getEnabledCodePreviewTools();
	if (enabledTools.has("bash")) registerBash(pi, cwd);
	if (enabledTools.has("read")) registerRead(pi, cwd);
	if (enabledTools.has("write")) registerWrite(pi, cwd);
	if (enabledTools.has("edit")) registerEdit(pi, cwd);
	if (enabledTools.has("grep")) registerGrep(pi, cwd);
	if (enabledTools.has("find")) registerFind(pi, cwd);
	if (enabledTools.has("ls")) registerLs(pi, cwd);
}

function registerBash(pi: ExtensionAPI, cwd: string) {
	const originalBash = createBashToolDefinition(cwd);

	pi.registerTool({
		...originalBash,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalBash.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme, context) {
			const command = typeof args.command === "string" ? args.command : "";
			const timeout = typeof args.timeout === "number" ? theme.fg("muted", ` (timeout ${args.timeout}s)`) : "";
			const highlighted = renderHighlightedText(command || "...", "bash", theme, context.invalidate).join("\n");
			const warnings = codePreviewSettings.bashWarnings ? getBashWarnings(command) : [];
			const warningText = warnings.length ? `${theme.fg("warning", `⚠ Preview ${countLabel(warnings.length, "warning")}: ${warnings.join(", ")}`)}\n` : "";
			return new Text(`${warningText}${theme.fg("toolTitle", theme.bold("$"))} ${highlighted}${timeout}`, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Running…"), 0, 0);
			const output = getTextContent(result.content).trim();
			const lines = output ? output.split("\n").map((line) => theme.fg(context.isError ? "error" : "toolOutput", line)) : [];
			const limit = expanded ? lines.length : 8;
			const preview = previewLines(lines, limit, theme);
			let text = preview.lines.length ? withSecretWarning(output, theme, preview.lines.join("\n")) : theme.fg("muted", "No output");
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, lines.length, "output lines");
			if (isTruncated(result.details)) text += previewFooter(theme, "Output truncated by bash");
			const fullOutputPath = getObjectValue(result.details, "fullOutputPath");
			if (typeof fullOutputPath === "string") text += previewFooter(theme, `Full output: ${fullOutputPath}`);
			return new Text(text, 0, 0);
		},
	});
}

function registerRead(pi: ExtensionAPI, cwd: string) {
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
			if (context.isError || firstText.startsWith("Error")) {
				return new Text(theme.fg("error", firstText.split("\n")[0] || "Read failed"), 0, 0);
			}

			const path = getPathArg(context.args);

			// Image reads already provide a concise text/image payload; keep the call header
			// from renderCall and show a compact image note as the result body.
			if (result.content?.some((part) => part.type === "image")) {
				return new Text(theme.fg("dim", firstText.replace(/^Read image file/i, "image")), 0, 0);
			}

			const lang = resolvePreviewLanguage({ path, content: firstText, piLanguage: getLanguageFromPath(path) });
			const firstLine = getReadStartLine(context.args);
			const lines = withOptionalReadLineNumbers(
				trimTrailingEmptyLines(renderHighlightedText(firstText, lang, theme, context.invalidate)),
				firstLine,
				theme,
			);
			const limit = expanded ? lines.length : codePreviewSettings.readCollapsedLines;
			const preview = previewLines(lines, limit, theme);

			let text = preview.lines.length ? withSecretWarning(firstText, theme, preview.lines.join("\n")) : theme.fg("muted", "Empty file");
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, lines.length, "lines");

			if (shouldSkipHighlight(firstText)) text += previewFooter(theme, "Syntax highlighting skipped for large file");
			if (isTruncated(result.details)) text += previewFooter(theme, "Output truncated by read");
			return new Text(text, 0, 0);
		},
	});
}

function registerWrite(pi: ExtensionAPI, cwd: string) {
	const originalWrite = createWriteToolDefinition(cwd);

	pi.registerTool({
		...originalWrite,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const path = getPathArg(params);
			const content = typeof params.content === "string" ? params.content : "";
			const before = path ? await readExistingFileForPreview(path, cwd, content) : undefined;
			const result = await originalWrite.execute(toolCallId, params, signal, onUpdate, ctx);
			const details = result.details && typeof result.details === "object" ? result.details : {};
			return { ...result, details: { ...details, codePreviewBeforeWrite: before } };
		},

		renderCall(args, theme, context) {
			const path = getPathArg(args);
			const content = typeof args.content === "string" ? args.content : "";
			const lang = resolvePreviewLanguage({ path, content, piLanguage: getLanguageFromPath(path) });
			const lines = trimTrailingEmptyLines(renderHighlightedText(content, lang, theme, context.invalidate));
			const limit = context.expanded ? lines.length : codePreviewSettings.writeCollapsedLines;
			const preview = previewLines(lines, limit, theme);

			let text = `${theme.fg("toolTitle", theme.bold("write"))} ${renderDisplayPath(path, cwd, theme)}`;
			text += metadata(theme, [
				formatBytes(Buffer.byteLength(content, "utf8")),
				countLabel(lines.length, "line"),
				lang ? normalizeShikiLanguage(lang) : undefined,
			]);
			const contentPreview = preview.lines.length ? withSecretWarning(content, theme, preview.lines.join("\n")) : theme.fg("muted", "Empty content");
			text += `\n${contentPreview}`;
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, lines.length, "lines");
			if (shouldSkipHighlight(content)) text += previewFooter(theme, "Syntax highlighting skipped for large content");
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, context) {
			const firstText = getTextContent(result.content);
			if (context.isError) return new Text(theme.fg("error", firstText || "Write failed"), 0, 0);

			const path = getPathArg(context.args);
			const content = typeof context.args?.content === "string" ? context.args.content : "";
			const before = getObjectValue(result.details, "codePreviewBeforeWrite");
			const beforeContent = getObjectValue(before, "content");
			const skipReason = getWriteDiffSkipReason(before, content);
			if (skipReason) return new Text(theme.fg("success", "✓ Write applied") + theme.fg("muted", ` · diff skipped: ${skipReason}`), 0, 0);
			if (typeof beforeContent === "string" && beforeContent !== content) {
				const render = () => renderWriteDiffPreview(beforeContent, content, path, expanded, theme, context.invalidate);
				return shouldRenderAsync(beforeContent + content)
					? new AsyncPreview("Rendering write diff…", theme, render, context.invalidate)
					: render();
			}
			if (typeof beforeContent === "string") return new Text(theme.fg("muted", "✓ Write applied · no changes"), 0, 0);
			return new Text(theme.fg("success", `✓ New file (${countLabel(content.split("\n").length, "line")})`), 0, 0);
		},
	});
}

function registerEdit(pi: ExtensionAPI, cwd: string) {
	const originalEdit = createEditToolDefinition(cwd);

	pi.registerTool({
		...originalEdit,
		// The built-in edit tool uses renderShell: "self". Override that so pi
		// wraps our highlighted diff in the standard colored tool background.
		renderShell: "default",

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalEdit.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme, context) {
			const argsKey = JSON.stringify(args ?? {});
			if (context.state.editArgsKey !== argsKey) {
				context.state.editArgsKey = argsKey;
				context.state.editSummaryText = undefined;
			}
			const path = getPathArg(args);
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
			context.state.editHeaderText = text;
			text.setText(formatEditHeader(path, cwd, theme, context.state.editSummaryText));
			return text;
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Editing…"), 0, 0);

			const firstText = getTextContent(result.content);
			if (context.isError || firstText.startsWith("Error")) {
				context.state.editSummaryText = undefined;
				updateEditHeader(context, cwd, theme);
				return new Text(theme.fg("error", firstText.split("\n")[0] || "Edit failed"), 0, 0);
			}

			const diff = getEditDiff(result.details);
			if (!diff) {
				context.state.editSummaryText = `${theme.fg("success", "✓ Edit applied")}${theme.fg("muted", " · no diff")}`;
				updateEditHeader(context, cwd, theme);
				return new Container();
			}

			const filePath = getPathArg(context.args);
			const lang = resolvePreviewLanguage({ path: filePath, piLanguage: getLanguageFromPath(filePath) });
			const summary = summarizeDiff(diff);
			const limit = expanded || codePreviewSettings.editCollapsedLines === "all" ? summary.totalLines : codePreviewSettings.editCollapsedLines;
			context.state.editSummaryText = formatEditSummary(summary, limit, theme);
			if (!expanded) context.state.editSummaryText += theme.fg("dim", ` (${keyHint("app.tools.expand", "expand")})`);
			updateEditHeader(context, cwd, theme);
			const render = () => renderEditDiffPreview(diff, lang, limit, summary.totalLines, theme, context.invalidate);
			return shouldRenderAsync(diff)
				? new AsyncPreview("Rendering edit diff…", theme, render, context.invalidate)
				: render();
		},
	});
}

function renderWriteDiffPreview(before: string, content: string, path: string, expanded: boolean, theme: Theme, invalidate?: () => void): FullWidthDiffText {
	if (shouldSkipWriteDiffText(before + content)) {
		return new FullWidthDiffText(theme.fg("success", "✓ Write applied") + theme.fg("muted", " · diff skipped for large content"), theme);
	}
	const diff = createSimpleDiff(before, content);
	const lang = resolvePreviewLanguage({ path, content, piLanguage: getLanguageFromPath(path) });
	const summary = summarizeDiff(diff);
	const limit = expanded || codePreviewSettings.editCollapsedLines === "all" ? summary.totalLines : codePreviewSettings.editCollapsedLines;
	let text = `${theme.fg("success", "✓ Write applied")} ${theme.fg("muted", describeEditShape(summary))}${editSummarySeparator(theme)}${theme.fg("success", `+${summary.additions}`)} ${theme.fg("error", `-${summary.removals}`)}\n`;
	text += renderSyntaxHighlightedDiff(diff, lang, theme, limit, invalidate);
	if (summary.totalLines > limit) text += showingFooter(theme, limit, summary.totalLines, "diff lines");
	if (shouldSkipHighlight(diff)) text += previewFooter(theme, "Syntax highlighting skipped for large diff");
	return new FullWidthDiffText(text, theme);
}

function renderEditDiffPreview(diff: string, lang: string | undefined, limit: number, totalLines: number, theme: Theme, invalidate?: () => void): FullWidthDiffText {
	let text = renderSyntaxHighlightedDiff(diff, lang, theme, limit, invalidate);
	if (totalLines > limit) text += showingFooter(theme, limit, totalLines, "diff lines");
	if (shouldSkipHighlight(diff)) text += previewFooter(theme, "Syntax highlighting skipped for large diff");
	return new FullWidthDiffText(text, theme);
}

function formatEditHeader(path: string, cwd: string, theme: Theme, summaryText: unknown): string {
	const base = `${theme.fg("toolTitle", theme.bold("edit"))} ${renderDisplayPath(path, cwd, theme)}`;
	return typeof summaryText === "string" && summaryText ? `${base}${editSummarySeparator(theme)}${summaryText}` : base;
}

function updateEditHeader(context: { args: unknown; state: Record<string, unknown> }, cwd: string, theme: Theme): void {
	const text = context.state.editHeaderText;
	if (text instanceof Text) text.setText(formatEditHeader(getPathArg(context.args), cwd, theme, context.state.editSummaryText));
}

function formatEditSummary(summary: ReturnType<typeof summarizeDiff>, limit: number, theme: Theme): string {
	let text = theme.fg("muted", describeEditShape(summary));
	text += editSummarySeparator(theme) + theme.fg("muted", countLabel(summary.hunks, "hunk"));
	text += editSummarySeparator(theme) + `${theme.fg("success", `+${summary.additions}`)} ${theme.fg("error", `-${summary.removals}`)}`;
	if (summary.totalLines > limit) text += editSummarySeparator(theme) + theme.fg("muted", `showing ${limit}/${summary.totalLines} diff lines`);
	return text;
}

function withSecretWarning(source: string, theme: Theme, preview: string): string {
	if (!codePreviewSettings.secretWarnings) return preview;
	const warnings = getSecretWarnings(source);
	if (warnings.length === 0) return preview;
	return `${theme.fg("warning", `⚠ Preview ${countLabel(warnings.length, "warning")}: possible ${warnings.join(", ")}`)}\n${preview}`;
}

function editSummarySeparator(theme: Theme): string {
	return theme.fg("muted", " · ");
}

function describeEditShape(summary: ReturnType<typeof summarizeDiff>): string {
	const parts: string[] = [];
	if (summary.replacements > 0) parts.push(countLabel(summary.replacements, "replacement"));
	if (summary.insertions > 0) parts.push(countLabel(summary.insertions, "insertion"));
	if (summary.deletions > 0) parts.push(countLabel(summary.deletions, "deletion"));
	return parts.length ? parts.join(", ") : "changes";
}

function withOptionalReadLineNumbers(lines: string[], firstLine: number, theme: Theme): string[] {
	if (!codePreviewSettings.readLineNumbers || lines.length === 0) return lines;
	const lastLine = firstLine + lines.length - 1;
	const width = String(lastLine).length;
	return lines.map((line, index) => {
		const lineNumber = String(firstLine + index).padStart(width, " ");
		return `${theme.fg("dim", `${lineNumber} │ `)}${line}`;
	});
}
