import type { EditToolDetails, ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import {
	createEditTool,
	createReadTool,
	createWriteTool,
	getLanguageFromPath,
	highlightCode,
	keyHint,
} from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { createHighlighter } from "shiki";

let shikiHighlighter: Awaited<ReturnType<typeof createHighlighter>> | undefined;

/**
 * Syntax-highlighted read/write/edit previews for pi.
 *
 * Install locally by keeping this file at:
 *   .pi/extensions/syntax-highlight-tools.ts
 *
 * Then run /reload, or start pi with:
 *   pi -e ./.pi/extensions/syntax-highlight-tools.ts
 */
export default async function syntaxHighlightToolPreviews(pi: ExtensionAPI) {
	try {
		shikiHighlighter = await createHighlighter({
			themes: ["dark-plus"],
			langs: [
				"bash",
				"shellscript",
				"typescript",
				"tsx",
				"javascript",
				"jsx",
				"json",
				"markdown",
				"html",
				"css",
				"yaml",
				"python",
				"diff",
			],
		});
	} catch {
		// Fall back to pi's built-in highlighter if Shiki is unavailable.
		shikiHighlighter = undefined;
	}

	const cwd = process.cwd();
	registerRead(pi, cwd);
	registerWrite(pi, cwd);
	registerEdit(pi, cwd);
}

function registerRead(pi: ExtensionAPI, cwd: string) {
	const originalRead = createReadTool(cwd);

	pi.registerTool({
		name: "read",
		label: originalRead.label ?? "read",
		description: originalRead.description,
		parameters: originalRead.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalRead.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme) {
			const path = getPathArg(args);
			let text = `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", path || "...")}`;
			if (typeof args.offset === "number" || typeof args.limit === "number") {
				const start = typeof args.offset === "number" ? args.offset : 1;
				const end = typeof args.limit === "number" ? start + args.limit - 1 : undefined;
				text += theme.fg("warning", `:${start}${end ? `-${end}` : ""}`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Reading..."), 0, 0);
			const firstText = getTextContent(result.content);
			if (result.isError || firstText.startsWith("Error")) {
				return new Text(theme.fg("error", firstText.split("\n")[0] || "Read failed"), 0, 0);
			}

			// Image reads already provide a concise text/image payload; leave text alone.
			if (result.content?.some((part) => part.type === "image")) {
				return new Text(theme.fg("toolOutput", firstText), 0, 0);
			}

			const path = getPathArg(context.args);
			const lang = getLanguageFromPath(path);
			const lines = trimTrailingEmptyLines(renderHighlightedText(firstText, lang, theme));
			const limit = expanded ? lines.length : 20;
			const shown = lines.slice(0, limit);
			const remaining = lines.length - shown.length;

			let text = `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", path || "file")}`;
			text += theme.fg("dim", ` • ${lines.length} line${lines.length === 1 ? "" : "s"}`);
			text += `\n${shown.join("\n")}`;
			if (remaining > 0) text += theme.fg("muted", `\n… ${remaining} more lines (${keyHint("app.tools.expand", "expand")})`);

			const truncation = (result.details as { truncation?: { truncated?: boolean } } | undefined)?.truncation;
			if (truncation?.truncated) text += theme.fg("warning", "\n[Output truncated by read tool]");
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

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalWrite.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme, context) {
			const path = getPathArg(args);
			const content = typeof args.content === "string" ? args.content : "";
			const lang = getLanguageFromPath(path);
			const lines = trimTrailingEmptyLines(renderHighlightedText(content, lang, theme));
			const limit = context.expanded ? lines.length : 20;
			const shown = lines.slice(0, limit);
			const remaining = lines.length - shown.length;

			let text = `${theme.fg("toolTitle", theme.bold("write"))} ${theme.fg("accent", path || "...")}`;
			if (content) {
				text += theme.fg("dim", ` • ${content.length} bytes, ${lines.length} line${lines.length === 1 ? "" : "s"}`);
				text += `\n${shown.join("\n")}`;
				if (remaining > 0) text += theme.fg("muted", `\n… ${remaining} more lines (${keyHint("app.tools.expand", "expand")})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, context) {
			if (!result.isError && !context.isError) return new Container();
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

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalEdit.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme) {
			const path = getPathArg(args);
			return new Text(`${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", path || "...")}`, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Editing..."), 0, 0);

			const firstText = getTextContent(result.content);
			if (result.isError || firstText.startsWith("Error")) {
				return new Text(theme.fg("error", firstText.split("\n")[0] || "Edit failed"), 0, 0);
			}

			const details = result.details as EditToolDetails | undefined;
			const diff = details?.diff;
			if (!diff) return new Text(theme.fg("success", "✓ Edit applied"), 0, 0);

			const filePath = getPathArg(context.args);
			const lang = getLanguageFromPath(filePath);
			const summary = summarizeDiff(diff);
			const limit = expanded ? 240 : 100;
			const rendered = renderSyntaxHighlightedDiff(diff, lang, theme, limit);

			let text = `${theme.fg("success", `+${summary.additions}`)} ${theme.fg("error", `-${summary.removals}`)}`;
			text += theme.fg("dim", ` in ${filePath || "file"}`);
			if (summary.totalLines > limit) text += theme.fg("dim", ` • showing ${limit}/${summary.totalLines} lines`);
			if (!expanded) text += theme.fg("dim", ` (${keyHint("app.tools.expand", "expand")})`);
			text += `\n${rendered}`;

			return new Text(text, 0, 0);
		},
	});
}

function getPathArg(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const record = args as Record<string, unknown>;
	const path = record.path ?? record.file_path;
	return typeof path === "string" ? path : "";
}

function getTextContent(content: Array<{ type: string; text?: string }> | undefined): string {
	return content
		?.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n") ?? "";
}

function renderHighlightedText(text: string, lang: string | undefined, theme: Theme): string[] {
	const normalized = text.replace(/\t/g, "   ");
	if (!lang) return normalized.split("\n").map((line) => theme.fg("toolOutput", line));
	if (lang === "markdown") return renderMarkdownWithHighlightedFences(normalized, theme);
	const rich = renderWithShiki(normalized, lang);
	if (rich) return rich;
	if (isShellLanguage(lang)) return highlightShell(normalized, theme);
	try {
		return highlightCode(normalized, lang);
	} catch {
		return normalized.split("\n");
	}
}

function renderWithShiki(code: string, lang: string | undefined): string[] | undefined {
	if (!shikiHighlighter || !lang) return undefined;
	const shikiLang = normalizeShikiLanguage(lang);
	try {
		const tokens = shikiHighlighter.codeToTokensBase(code, { lang: shikiLang, theme: "dark-plus" });
		return tokens.map((line) => line.map((token) => ansiFromToken(token)).join(""));
	} catch {
		return undefined;
	}
}

function ansiFromToken(token: { content: string; color?: string; fontStyle?: number }): string {
	let open = token.color ? ansiFg(token.color) : "";
	let close = token.color ? "\x1b[39m" : "";
	// TextMate fontStyle bit flags: italic=1, bold=2, underline=4.
	if (token.fontStyle) {
		if (token.fontStyle & 2) {
			open += "\x1b[1m";
			close = "\x1b[22m" + close;
		}
		if (token.fontStyle & 1) {
			open += "\x1b[3m";
			close = "\x1b[23m" + close;
		}
		if (token.fontStyle & 4) {
			open += "\x1b[4m";
			close = "\x1b[24m" + close;
		}
	}
	return open + token.content + close;
}

function ansiFg(hex: string): string {
	const clean = hex.replace(/^#/, "").slice(0, 6);
	const n = Number.parseInt(clean, 16);
	if (!Number.isFinite(n)) return "";
	return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

function normalizeShikiLanguage(lang: string): string {
	const normalized = lang.toLowerCase();
	if (normalized === "sh" || normalized === "shell" || normalized === "zsh") return "bash";
	if (normalized === "shell-session" || normalized === "shellsession" || normalized === "terminal" || normalized === "console") return "shellscript";
	if (normalized === "ts") return "typescript";
	if (normalized === "js") return "javascript";
	if (normalized === "md") return "markdown";
	if (normalized === "yml") return "yaml";
	return normalized;
}

function renderMarkdownWithHighlightedFences(markdown: string, theme: Theme): string[] {
	const lines = markdown.split("\n");
	const out: string[] = [];
	let inFence = false;
	let fenceLang: string | undefined;
	let fenceBuffer: string[] = [];

	const flushFenceBuffer = () => {
		if (fenceBuffer.length === 0) return;
		const code = fenceBuffer.join("\n");
		try {
			out.push(...renderHighlightedText(code, normalizeFenceLanguage(fenceLang), theme));
		} catch {
			out.push(...fenceBuffer.map((line) => theme.fg("mdCodeBlock", line)));
		}
		fenceBuffer = [];
	};

	for (const line of lines) {
		const fence = line.match(/^\s*```\s*([^`]*)\s*$/);
		if (fence) {
			if (inFence) {
				flushFenceBuffer();
				out.push(theme.fg("mdCodeBlockBorder", line));
				inFence = false;
				fenceLang = undefined;
			} else {
				out.push(theme.fg("mdCodeBlockBorder", line));
				inFence = true;
				fenceLang = normalizeFenceLanguage(fence[1]?.trim() || undefined);
			}
			continue;
		}

		if (inFence) {
			fenceBuffer.push(line);
		} else {
			try {
				out.push(...highlightCode(line, "markdown"));
			} catch {
				out.push(theme.fg("toolOutput", line));
			}
		}
	}

	// Gracefully handle an unterminated fence.
	if (inFence) flushFenceBuffer();
	return out;
}

function normalizeFenceLanguage(lang: string | undefined): string | undefined {
	if (!lang) return undefined;
	// Markdown fences often contain attributes like ```bash title="setup".
	// pi/highlight.js expects just the language id.
	const first = lang.trim().split(/\s+/)[0]?.toLowerCase();
	if (!first) return undefined;
	if (first === "console" || first === "terminal" || first === "shell-session") return "bash";
	return first;
}

function isShellLanguage(lang: string | undefined): boolean {
	return lang === "bash" || lang === "sh" || lang === "shell" || lang === "zsh";
}

function highlightShell(code: string, theme: Theme): string[] {
	return code.split("\n").map((line) => {
		if (!line.trim()) return "";
		const trimmedStart = line.match(/^\s*/)?.[0] ?? "";
		const rest = line.slice(trimmedStart.length);
		if (rest.startsWith("#")) return theme.fg("syntaxComment", line);

		// Highlight heredoc delimiters and quoted strings first, then color command words.
		let rendered = rest.replace(/<<\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g, (_m, quote, marker) => {
			return `<<${quote}${theme.fg("syntaxString", marker)}${quote}`;
		});
		rendered = rendered.replace(/(['"])(?:(?!\1).)*\1/g, (match) => theme.fg("syntaxString", match));

		// Color the first command in a pipeline/list and commands after control operators.
		rendered = rendered.replace(/(^|[|;&(){}]\s*)([A-Za-z_./-][A-Za-z0-9_./:-]*)(?=\s|$)/g, (match, prefix, command) => {
			if (command === "then" || command === "do" || command === "done" || command === "fi" || command === "else") {
				return `${prefix}${theme.fg("syntaxKeyword", command)}`;
			}
			return `${prefix}${theme.fg("syntaxFunction", command)}`;
		});

		// Common shell keywords may not appear command-position in all cases.
		rendered = rendered.replace(/\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|in)\b/g, (kw) =>
			theme.fg("syntaxKeyword", kw),
		);
		return trimmedStart + rendered;
	});
}

function trimTrailingEmptyLines(lines: string[]): string[] {
	let end = lines.length;
	while (end > 0 && lines[end - 1] === "") end--;
	return lines.slice(0, end);
}

function summarizeDiff(diff: string): { additions: number; removals: number; totalLines: number } {
	let additions = 0;
	let removals = 0;
	const lines = diff.split("\n");
	for (const line of lines) {
		if (line.startsWith("+") && !line.startsWith("+++")) additions++;
		else if (line.startsWith("-") && !line.startsWith("---")) removals++;
	}
	return { additions, removals, totalLines: lines.length };
}

function renderSyntaxHighlightedDiff(diff: string, lang: string | undefined, theme: Theme, limit: number): string {
	const lines = diff.split("\n");
	const out: string[] = [];

	for (const line of lines.slice(0, limit)) {
		const parsed = parseDiffLine(line);
		if (!parsed) {
			out.push(theme.fg("toolDiffContext", line));
			continue;
		}

		const content = parsed.content.replace(/\t/g, "   ");
		const highlighted = highlightSingleLine(content, lang, theme);

		if (parsed.kind === "+") out.push(`${theme.fg("toolDiffAdded", `+${parsed.lineNumber} `)}${highlighted}`);
		else if (parsed.kind === "-") out.push(`${theme.fg("toolDiffRemoved", `-${parsed.lineNumber} `)}${highlighted}`);
		else out.push(`${theme.fg("toolDiffContext", ` ${parsed.lineNumber} `)}${highlighted || theme.fg("toolDiffContext", "")}`);
	}

	if (lines.length > limit) out.push(theme.fg("muted", `… ${lines.length - limit} more diff lines`));
	return out.join("\n");
}

function parseDiffLine(line: string): { kind: "+" | "-" | " "; lineNumber: string; content: string } | null {
	const match = line.match(/^([+\- ])(\s*\d*)\s(.*)$/);
	if (!match) return null;
	return { kind: match[1] as "+" | "-" | " ", lineNumber: match[2] ?? "", content: match[3] ?? "" };
}

function highlightSingleLine(line: string, lang: string | undefined, theme: Theme): string {
	const rich = renderWithShiki(line, lang);
	if (rich?.[0] !== undefined) return rich[0];
	if (isShellLanguage(lang)) return highlightShell(line, theme)[0] ?? line;
	try {
		return highlightCode(line, lang)[0] ?? line;
	} catch {
		return line;
	}
}
