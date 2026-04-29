import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition, getLanguageFromPath, keyHint } from "@mariozechner/pi-coding-agent";
import { Container, Text, type Component } from "@mariozechner/pi-tui";
import { AsyncPreview, shouldRenderAsync } from "./async-preview.js";
import { getBashWarnings } from "./bash-warnings.js";
import { getEditDiff, getObjectValue, getPathArg, getReadStartLine, getTextContent, isTruncated } from "./data.js";
import { FullWidthDiffText, renderPlainDiff, renderSyntaxHighlightedDiff, summarizeDiff } from "./diff.js";
import { countLabel, formatBytes, hiddenLinesMarker, metadata, previewFooter, previewLines, selectPreviewLines, showingFooter, trimSingleTrailingNewline, trimTrailingEmptyLines } from "./format.js";
import { resolvePreviewLanguage } from "./language.js";
import { renderDisplayPath } from "./paths.js";
import { getSecretWarnings } from "./secret-warnings.js";
import { codePreviewSettings } from "./settings.js";
import { normalizeShikiLanguage, renderHighlightedText, shouldSkipHighlight } from "./shiki.js";
import { escapeControlChars } from "./terminal-text.js";
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
			const output = trimSingleTrailingNewline(getTextContent(result.content));
			const lines = output ? output.split("\n").map((line) => theme.fg(context.isError ? "error" : "toolOutput", escapeControlChars(line))) : [];
			const limit = expanded ? lines.length : 8;
			const preview = previewLines(lines, limit, theme);
			let text = preview.lines.length ? withSecretWarning(output, theme, preview.lines.join("\n")) : theme.fg("muted", "No output");
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, lines.length, "output lines");
			if (isTruncated(result.details)) text += previewFooter(theme, "Output truncated by bash");
			const fullOutputPath = getObjectValue(result.details, "fullOutputPath");
			if (typeof fullOutputPath === "string") text += previewFooter(theme, `Full output: ${escapeControlChars(fullOutputPath)}`);
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
			const rawLines = trimTrailingEmptyLines(content.replace(/\t/g, "   ").split("\n"));
			const limit = context.expanded ? rawLines.length : codePreviewSettings.writeCollapsedLines;
			const skipHighlight = shouldSkipHighlight(content);
			const preview = renderHighlightedPreviewLines(rawLines, limit, skipHighlight ? undefined : lang, theme, context.invalidate);

			let text = `${theme.fg("toolTitle", theme.bold("write"))} ${renderDisplayPath(path, cwd, theme)}`;
			text += metadata(theme, [
				formatBytes(Buffer.byteLength(content, "utf8")),
				countLabel(rawLines.length, "line"),
				lang ? normalizeShikiLanguage(lang) : undefined,
			]);
			const contentPreview = preview.lines.length ? withSecretWarning(content, theme, preview.lines.join("\n")) : theme.fg("muted", "Empty content");
			text += `\n${contentPreview}`;
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, rawLines.length, "lines");
			if (skipHighlight) text += previewFooter(theme, "Syntax highlighting skipped for large content");
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, context) {
			const firstText = getTextContent(result.content);
			if (context.isError) return new Text(theme.fg("error", escapeControlChars(firstText || "Write failed")), 0, 0);

			const path = getPathArg(context.args);
			const content = typeof context.args?.content === "string" ? context.args.content : "";
			const before = getObjectValue(result.details, "codePreviewBeforeWrite");
			const beforeContent = getObjectValue(before, "content");
			const skipReason = getWriteDiffSkipReason(before, content);
			if (skipReason) return new Text(theme.fg("success", "✓ Write applied") + theme.fg("muted", ` · diff skipped: ${skipReason}`), 0, 0);
			if (typeof beforeContent === "string" && beforeContent !== content) {
				const render = () => renderWriteDiffPreview(beforeContent, content, path, expanded, theme, context.invalidate);
				const source = `${beforeContent}\0${content}`;
				const previewKey = previewCacheKey("write-result", source, path, expanded, theme);
				return cachedPreview(context.state, "writeResultPreviewKey", "writeResultPreviewComponent", previewKey, () => shouldRenderAsync(source)
					? new AsyncPreview("Rendering write diff…", theme, render, context.invalidate)
					: render());
			}
			if (typeof beforeContent === "string") return new Text(theme.fg("muted", "✓ Write applied · no changes"), 0, 0);
			return new Text(theme.fg("success", `✓ New file (${countLabel(countFileLines(content), "line")})`), 0, 0);
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
				context.state.editCallPreviewKey = undefined;
				context.state.editCallPreviewComponent = undefined;
			}
			const path = getPathArg(args);
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
			context.state.editHeaderText = text;
			text.setText(formatEditHeader(path, cwd, theme, context.state.editSummaryText));

			const operations = getEditPreviewOperations(args);
			if (!context.argsComplete || operations.length === 0 || context.executionStarted) return text;

			const previewKey = `${argsKey}:${context.expanded ? "expanded" : "collapsed"}:${codePreviewSettings.editCollapsedLines}`;
			if (context.state.editCallPreviewKey !== previewKey) {
				context.state.editCallPreviewKey = previewKey;
				const render = () => renderEditCallPreview(operations, path, context.expanded, theme, context.invalidate);
				context.state.editCallPreviewComponent = shouldRenderAsync(operations.map((operation) => operation.oldText + operation.newText).join("\n"))
					? new AsyncPreview("Rendering proposed edit diff…", theme, render, context.invalidate)
					: render();
			}
			return new HeaderAndBody(text, context.state.editCallPreviewComponent as Component);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Editing…"), 0, 0);

			const firstText = getTextContent(result.content);
			if (context.isError) {
				context.state.editSummaryText = undefined;
				updateEditHeader(context, cwd, theme);
				return new Text(theme.fg("error", escapeControlChars(firstText.split("\n")[0] || "Edit failed")), 0, 0);
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
			if (!expanded && summary.totalLines > limit) context.state.editSummaryText += theme.fg("dim", ` (${keyHint("app.tools.expand", "expand")})`);
			updateEditHeader(context, cwd, theme);
			const render = () => renderEditDiffPreview(diff, lang, limit, summary.totalLines, theme, context.invalidate);
			const previewKey = previewCacheKey("edit-result", diff, filePath, expanded, theme);
			return cachedPreview(context.state, "editResultPreviewKey", "editResultPreviewComponent", previewKey, () => shouldRenderAsync(diff)
				? new AsyncPreview("Rendering edit diff…", theme, render, context.invalidate)
				: render());
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
	const skipSyntaxHighlight = shouldSkipHighlight(diff);
	text += skipSyntaxHighlight ? renderPlainDiff(diff, theme, limit) : renderSyntaxHighlightedDiff(diff, lang, theme, limit, invalidate);
	if (summary.totalLines > limit) text += showingFooter(theme, limit, summary.totalLines, "diff lines");
	if (skipSyntaxHighlight) text += previewFooter(theme, "Syntax highlighting skipped for large diff");
	return new FullWidthDiffText(text, theme);
}

function renderEditDiffPreview(diff: string, lang: string | undefined, limit: number, totalLines: number, theme: Theme, invalidate?: () => void): FullWidthDiffText {
	const skipSyntaxHighlight = shouldSkipHighlight(diff);
	let text = skipSyntaxHighlight ? renderPlainDiff(diff, theme, limit) : renderSyntaxHighlightedDiff(diff, lang, theme, limit, invalidate);
	if (totalLines > limit) text += showingFooter(theme, limit, totalLines, "diff lines");
	if (skipSyntaxHighlight) text += previewFooter(theme, "Syntax highlighting skipped for large diff");
	return new FullWidthDiffText(text, theme);
}

function getEditPreviewOperations(args: unknown): Array<{ oldText: string; newText: string }> {
	const edits = getObjectValue(args, "edits");
	if (Array.isArray(edits)) {
		return edits.flatMap((edit) => {
			const oldText = getObjectValue(edit, "oldText") ?? getObjectValue(edit, "old_text");
			const newText = getObjectValue(edit, "newText") ?? getObjectValue(edit, "new_text");
			return typeof oldText === "string" && typeof newText === "string" && oldText !== newText ? [{ oldText, newText }] : [];
		});
	}
	const oldText = getObjectValue(args, "oldText") ?? getObjectValue(args, "old_text");
	const newText = getObjectValue(args, "newText") ?? getObjectValue(args, "new_text");
	return typeof oldText === "string" && typeof newText === "string" && oldText !== newText ? [{ oldText, newText }] : [];
}

function renderEditCallPreview(operations: Array<{ oldText: string; newText: string }>, path: string, expanded: boolean, theme: Theme, invalidate?: () => void): FullWidthDiffText {
	const lang = resolvePreviewLanguage({ path, piLanguage: getLanguageFromPath(path) });
	const maxOperations = Math.min(operations.length, 3);
	const perOperationLimit = operations.length > 1
		? Math.max(8, Math.floor((typeof codePreviewSettings.editCollapsedLines === "number" ? codePreviewSettings.editCollapsedLines : 160) / maxOperations))
		: undefined;
	const sections: string[] = [];
	const diffs = operations.map((operation) => createSimpleDiff(operation.oldText, operation.newText));
	const summaries = diffs.map((diff) => summarizeDiff(diff));
	const totalAdditions = summaries.reduce((total, summary) => total + summary.additions, 0);
	const totalRemovals = summaries.reduce((total, summary) => total + summary.removals, 0);
	const totalLines = summaries.reduce((total, summary) => total + summary.totalLines, 0);

	for (let index = 0; index < maxOperations; index++) {
		const diff = diffs[index]!;
		const summary = summaries[index]!;
		const limit = expanded || codePreviewSettings.editCollapsedLines === "all" ? summary.totalLines : perOperationLimit ?? codePreviewSettings.editCollapsedLines;
		const skipSyntaxHighlight = shouldSkipHighlight(diff);
		let rendered = skipSyntaxHighlight ? renderPlainDiff(diff, theme, limit) : renderSyntaxHighlightedDiff(diff, lang, theme, limit, invalidate);
		if (summary.totalLines > limit) rendered += showingFooter(theme, limit, summary.totalLines, "proposed diff lines");
		if (skipSyntaxHighlight) rendered += previewFooter(theme, "Syntax highlighting skipped for large proposed diff");
		if (operations.length > 1) sections.push(theme.fg("muted", `Proposed edit ${index + 1}/${operations.length}`));
		sections.push(rendered);
	}

	const remainder = operations.length - maxOperations;
	const header = `${theme.fg("muted", "proposed edit")} ${theme.fg("success", `+${totalAdditions}`)} ${theme.fg("error", `-${totalRemovals}`)}${operations.length > 1 ? theme.fg("muted", ` · ${operations.length} edit blocks`) : ""}`;
	let text = `${header}\n${sections.join("\n")}`;
	if (remainder > 0) text += showingFooter(theme, maxOperations, operations.length, "edit blocks");
	else if (!expanded && operations.length === 1 && totalLines > (typeof codePreviewSettings.editCollapsedLines === "number" ? codePreviewSettings.editCollapsedLines : totalLines)) {
		text += theme.fg("dim", ` (${keyHint("app.tools.expand", "expand")})`);
	}
	return new FullWidthDiffText(text, theme);
}

class HeaderAndBody implements Component {
	constructor(private readonly header: Component, private readonly body: Component) {}

	render(width: number): string[] {
		return [...this.header.render(width), ...this.body.render(width)];
	}

	invalidate(): void {
		this.header.invalidate();
		this.body.invalidate();
	}
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

function countFileLines(content: string): number {
	if (!content) return 0;
	const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const withoutFinalTerminator = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
	return withoutFinalTerminator.split("\n").length;
}

function renderHighlightedPreviewLines(
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

function cachedPreview(
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

function previewCacheKey(kind: string, source: string, path: string, expanded: boolean, theme: Theme): string {
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

function hashString(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}
