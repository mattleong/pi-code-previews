import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { createBashTool, createEditTool, createReadTool, createWriteTool, getLanguageFromPath, keyHint } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { getEditDiff, getObjectValue, getPathArg, getReadStartLine, getTextContent, isTruncated } from "./data.js";
import { FullWidthDiffText, renderSyntaxHighlightedDiff, summarizeDiff } from "./diff.js";
import { countLabel, formatBytes, metadata, previewFooter, previewLines, showingFooter, trimTrailingEmptyLines } from "./format.js";
import { toolPreviewSettings } from "./settings.js";
import { normalizeShikiLanguage, renderHighlightedText } from "./shiki.js";

export function registerToolRenderers(pi: ExtensionAPI, cwd: string) {
	registerBash(pi, cwd);
	registerRead(pi, cwd);
	registerWrite(pi, cwd);
	registerEdit(pi, cwd);
}

function registerBash(pi: ExtensionAPI, cwd: string) {
	const originalBash = createBashTool(cwd);

	pi.registerTool({
		name: "bash",
		label: originalBash.label ?? "bash",
		description: originalBash.description,
		parameters: originalBash.parameters,

		async execute(toolCallId, params, signal, onUpdate) {
			return originalBash.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			const command = typeof args.command === "string" ? args.command : "";
			const timeout = typeof args.timeout === "number" ? theme.fg("muted", ` (timeout ${args.timeout}s)`) : "";
			const highlighted = renderHighlightedText(command || "...", "bash", theme).join("\n");
			return new Text(`${theme.fg("toolTitle", theme.bold("$"))} ${highlighted}${timeout}`, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Running…"), 0, 0);
			const output = getTextContent(result.content).trim();
			const lines = output ? output.split("\n").map((line) => theme.fg(context.isError ? "error" : "toolOutput", line)) : [];
			const limit = expanded ? lines.length : 8;
			const preview = previewLines(lines, limit, theme);
			let text = preview.lines.length ? preview.lines.join("\n") : theme.fg("muted", "No output");
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, lines.length, "output lines");
			if (isTruncated(result.details)) text += previewFooter(theme, "Output truncated by bash");
			const fullOutputPath = getObjectValue(result.details, "fullOutputPath");
			if (typeof fullOutputPath === "string") text += previewFooter(theme, `Full output: ${fullOutputPath}`);
			return new Text(text, 0, 0);
		},
	});
}

function registerRead(pi: ExtensionAPI, cwd: string) {
	const originalRead = createReadTool(cwd);

	pi.registerTool({
		name: "read",
		label: originalRead.label ?? "read",
		description: originalRead.description,
		parameters: originalRead.parameters,

		async execute(toolCallId, params, signal, onUpdate) {
			return originalRead.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			const path = getPathArg(args);
			const lang = getLanguageFromPath(path);
			let text = `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", path || "...")}`;
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

			const lang = getLanguageFromPath(path);
			const firstLine = getReadStartLine(context.args);
			const lines = withOptionalReadLineNumbers(
				trimTrailingEmptyLines(renderHighlightedText(firstText, lang, theme)),
				firstLine,
				theme,
			);
			const limit = expanded ? lines.length : toolPreviewSettings.readCollapsedLines;
			const preview = previewLines(lines, limit, theme);

			let text = preview.lines.length ? preview.lines.join("\n") : theme.fg("muted", "Empty file");
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, lines.length, "lines");

			if (isTruncated(result.details)) text += previewFooter(theme, "Output truncated by read");
			return new Text(text, 0, 0);
		},
	});
}

function registerWrite(pi: ExtensionAPI, cwd: string) {
	const originalWrite = createWriteTool(cwd);

	pi.registerTool({
		name: "write",
		label: originalWrite.label ?? "write",
		description: originalWrite.description,
		parameters: originalWrite.parameters,

		async execute(toolCallId, params, signal, onUpdate) {
			return originalWrite.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, context) {
			const path = getPathArg(args);
			const content = typeof args.content === "string" ? args.content : "";
			const lang = getLanguageFromPath(path);
			const lines = trimTrailingEmptyLines(renderHighlightedText(content, lang, theme));
			const limit = context.expanded ? lines.length : toolPreviewSettings.writeCollapsedLines;
			const preview = previewLines(lines, limit, theme);

			let text = `${theme.fg("toolTitle", theme.bold("write"))} ${theme.fg("accent", path || "...")}`;
			text += metadata(theme, [
				formatBytes(content.length),
				countLabel(lines.length, "line"),
				lang ? normalizeShikiLanguage(lang) : undefined,
			]);
			text += `\n${preview.lines.length ? preview.lines.join("\n") : theme.fg("muted", "Empty content")}`;
			if (preview.hidden > 0) text += showingFooter(theme, preview.shown, lines.length, "lines");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, context) {
			if (!context.isError) return new Container();
			const firstText = getTextContent(result.content);
			return new Text(theme.fg("error", firstText || "Write failed"), 0, 0);
		},
	});
}

function registerEdit(pi: ExtensionAPI, cwd: string) {
	const originalEdit = createEditTool(cwd);

	pi.registerTool({
		name: "edit",
		label: originalEdit.label ?? "edit",
		description: originalEdit.description,
		parameters: originalEdit.parameters,
		// The built-in edit tool uses renderShell: "self". Override that so pi
		// wraps our highlighted diff in the standard colored tool background.
		renderShell: "default",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalEdit.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			const path = getPathArg(args);
			return new Text(`${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", path || "...")}`, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Editing…"), 0, 0);

			const firstText = getTextContent(result.content);
			if (context.isError || firstText.startsWith("Error")) {
				return new Text(theme.fg("error", firstText.split("\n")[0] || "Edit failed"), 0, 0);
			}

			const diff = getEditDiff(result.details);
			if (!diff) return new Text(`${theme.fg("success", "✓ Edit applied")}${theme.fg("dim", " · no diff")}`, 0, 0);

			const filePath = getPathArg(context.args);
			const lang = getLanguageFromPath(filePath);
			const summary = summarizeDiff(diff);
			const limit = expanded ? summary.totalLines : toolPreviewSettings.editCollapsedLines;
			const rendered = renderSyntaxHighlightedDiff(diff, lang, theme, limit);

			let text = `${theme.fg("success", `+${summary.additions}`)} ${theme.fg("error", `-${summary.removals}`)}`;
			text += theme.fg("dim", ` in ${filePath || "file"}`);
			text += metadata(theme, [countLabel(summary.hunks, "hunk")]);
			if (!expanded) text += theme.fg("dim", ` (${keyHint("app.tools.expand", "expand")})`);
			text += `\n${rendered}`;
			if (summary.totalLines > limit) text += showingFooter(theme, limit, summary.totalLines, "diff lines");

			return new FullWidthDiffText(text);
		},
	});
}

function withOptionalReadLineNumbers(lines: string[], firstLine: number, theme: Theme): string[] {
	if (!toolPreviewSettings.readLineNumbers || lines.length === 0) return lines;
	const lastLine = firstLine + lines.length - 1;
	const width = String(lastLine).length;
	return lines.map((line, index) => {
		const lineNumber = String(firstLine + index).padStart(width, " ");
		return `${theme.fg("dim", `${lineNumber} │ `)}${line}`;
	});
}
