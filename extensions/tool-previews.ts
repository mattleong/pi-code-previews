import type { EditToolDetails, ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { createBashTool, createEditTool, createReadTool, createWriteTool, getLanguageFromPath, getSettingsListTheme, keyHint } from "@mariozechner/pi-coding-agent";
import { Container, Text, truncateToWidth, visibleWidth, type Component, type SettingItem, SettingsList } from "@mariozechner/pi-tui";
import { createHighlighter, bundledThemes } from "shiki";

let shikiHighlighter: Awaited<ReturnType<typeof createHighlighter>> | undefined;
const SETTINGS_STATE_TYPE = "tool-preview-settings";

type DiffBackgroundIntensity = "off" | "subtle" | "medium";
interface ToolPreviewSettings {
	shikiTheme: string;
	diffIntensity: DiffBackgroundIntensity;
	readCollapsedLines: number;
	writeCollapsedLines: number;
	editCollapsedLines: number;
	readLineNumbers: boolean;
}

let toolPreviewSettings: ToolPreviewSettings = {
	shikiTheme: "dark-plus",
	diffIntensity: "subtle",
	readCollapsedLines: 20,
	writeCollapsedLines: 20,
	editCollapsedLines: 100,
	readLineNumbers: true,
};

const loadedShikiLanguages = new Set<string>();
const pendingShikiLanguages = new Set<string>();

const PRELOADED_SHIKI_LANGUAGES = [
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
	"scss",
	"yaml",
	"toml",
	"python",
	"diff",
	"go",
	"rust",
	"java",
	"c",
	"cpp",
	"csharp",
	"php",
	"ruby",
	"sql",
	"dockerfile",
	"xml",
] as const;

/**
 * Syntax-highlighted tool previews for pi.
 *
 * Install locally by keeping this file at:
 *   .pi/extensions/tool-previews.ts
 *
 * Then run /reload, or start pi with:
 *   pi -e ./.pi/extensions/tool-previews.ts
 */
export default async function toolPreviews(pi: ExtensionAPI) {
	await initializeShiki(toolPreviewSettings.shikiTheme);

	function persistSettings() {
		pi.appendEntry<ToolPreviewSettings>(SETTINGS_STATE_TYPE, toolPreviewSettings);
	}

	pi.on("session_start", async (_event, ctx) => {
		restoreSettings(ctx);
		await initializeShiki(toolPreviewSettings.shikiTheme);
	});

	pi.registerCommand("tool-preview-settings", {
		description: "Configure tool preview settings",
		handler: async (_args, ctx) => {
			const items = createSettingsItems(toolPreviewSettings);
			await ctx.ui.custom((_tui, _theme, _kb, done) => {
				const list = new SettingsList(items, items.length + 2, getSettingsListTheme(), (id, value) => {
					const previousTheme = toolPreviewSettings.shikiTheme;
					toolPreviewSettings = updateSetting(toolPreviewSettings, id, value);
					if (toolPreviewSettings.shikiTheme !== previousTheme) void initializeShiki(toolPreviewSettings.shikiTheme);
					persistSettings();
				}, () => done(undefined));
				return list;
			});
		},
	});

	const cwd = process.cwd();
	registerBash(pi, cwd);
	registerRead(pi, cwd);
	registerWrite(pi, cwd);
	registerEdit(pi, cwd);
}

function createSettingsItems(current: ToolPreviewSettings): SettingItem[] {
	return [
		{ id: "shikiTheme", label: "Syntax theme", currentValue: current.shikiTheme, values: Object.keys(bundledThemes).sort() },
		{ id: "diffIntensity", label: "Diff background", currentValue: current.diffIntensity, values: ["off", "subtle", "medium"] },
		{ id: "readCollapsedLines", label: "Read preview lines", currentValue: String(current.readCollapsedLines), values: ["10", "20", "40", "80"] },
		{ id: "writeCollapsedLines", label: "Write preview lines", currentValue: String(current.writeCollapsedLines), values: ["10", "20", "40", "80"] },
		{ id: "editCollapsedLines", label: "Edit diff preview lines", currentValue: String(current.editCollapsedLines), values: ["60", "100", "160", "240"] },
		{ id: "readLineNumbers", label: "Read line numbers", currentValue: current.readLineNumbers ? "on" : "off", values: ["on", "off"] },
	];
}

async function initializeShiki(theme: string) {
	try {
		shikiHighlighter = await createHighlighter({ themes: [theme], langs: [...PRELOADED_SHIKI_LANGUAGES] });
		toolPreviewSettings = { ...toolPreviewSettings, shikiTheme: theme };
		loadedShikiLanguages.clear();
		for (const lang of PRELOADED_SHIKI_LANGUAGES) loadedShikiLanguages.add(lang);
	} catch (error) {
		console.warn("[pi-tool-previews] Shiki failed to initialize; previews will be plain text.", error);
		shikiHighlighter = undefined;
	}
}

function restoreSettings(ctx: ExtensionContext) {
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === SETTINGS_STATE_TYPE) {
			toolPreviewSettings = normalizeSettings(entry.data as Partial<ToolPreviewSettings> | undefined);
		}
	}
}

function normalizeSettings(data: Partial<ToolPreviewSettings> | undefined): ToolPreviewSettings {
	return {
		shikiTheme: typeof data?.shikiTheme === "string" && data.shikiTheme in bundledThemes ? data.shikiTheme : toolPreviewSettings.shikiTheme,
		diffIntensity: data?.diffIntensity === "off" || data?.diffIntensity === "medium" || data?.diffIntensity === "subtle" ? data.diffIntensity : toolPreviewSettings.diffIntensity,
		readCollapsedLines: coerceNumber(data?.readCollapsedLines, toolPreviewSettings.readCollapsedLines),
		writeCollapsedLines: coerceNumber(data?.writeCollapsedLines, toolPreviewSettings.writeCollapsedLines),
		editCollapsedLines: coerceNumber(data?.editCollapsedLines, toolPreviewSettings.editCollapsedLines),
		readLineNumbers: typeof data?.readLineNumbers === "boolean" ? data.readLineNumbers : toolPreviewSettings.readLineNumbers,
	};
}

function coerceNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function updateSetting(current: ToolPreviewSettings, id: string, value: string): ToolPreviewSettings {
	const next = { ...current };
	if (id === "shikiTheme" && value in bundledThemes) next.shikiTheme = value;
	else if (id === "diffIntensity") next.diffIntensity = value as DiffBackgroundIntensity;
	else if (id === "readCollapsedLines") next.readCollapsedLines = Number(value);
	else if (id === "writeCollapsedLines") next.writeCollapsedLines = Number(value);
	else if (id === "editCollapsedLines") next.editCollapsedLines = Number(value);
	else if (id === "readLineNumbers") next.readLineNumbers = value === "on";
	return next;
}

function registerBash(pi: ExtensionAPI, cwd: string) {
	const originalBash = createBashTool(cwd);

	pi.registerTool({
		name: "bash",
		label: originalBash.label ?? "bash",
		description: originalBash.description,
		parameters: originalBash.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return originalBash.execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme) {
			const command = typeof args.command === "string" ? args.command : "";
			const timeout = typeof args.timeout === "number" ? theme.fg("muted", ` (timeout ${args.timeout}s)`) : "";
			const highlighted = renderHighlightedText(command || "...", "bash", theme).join("\n");
			return new Text(`${theme.fg("toolTitle", theme.bold("$"))} ${highlighted}${timeout}`, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Running…"), 0, 0);
			const output = getTextContent(result.content).trim();
			const lines = output ? output.split("\n").map((line) => theme.fg(result.isError ? "error" : "toolOutput", line)) : [];
			const limit = expanded ? lines.length : 8;
			const preview = previewLines(lines, limit, theme);
			let text = preview.lines.length ? preview.lines.join("\n") : theme.fg("muted", "No output");
			if (preview.hidden > 0) text += previewFooter(theme, `Showing ${preview.shown} of ${lines.length} output lines · ${keyHint("app.tools.expand", "expand")}`);
			const details = result.details as { truncation?: { truncated?: boolean }; fullOutputPath?: string } | undefined;
			if (details?.truncation?.truncated) text += previewFooter(theme, "Output truncated by bash");
			if (details?.fullOutputPath) text += previewFooter(theme, `Full output: ${details.fullOutputPath}`);
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
			if (isPartial) return new Text(theme.fg("warning", "Reading…"), 0, 0);
			const firstText = getTextContent(result.content);
			if (result.isError || firstText.startsWith("Error")) {
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
			if (preview.hidden > 0) text += previewFooter(theme, `Showing ${preview.shown} of ${lines.length} lines · ${keyHint("app.tools.expand", "expand")}`);

			const truncation = (result.details as { truncation?: { truncated?: boolean } } | undefined)?.truncation;
			if (truncation?.truncated) text += previewFooter(theme, "Output truncated by read");
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
			const limit = context.expanded ? lines.length : toolPreviewSettings.writeCollapsedLines;
			const preview = previewLines(lines, limit, theme);

			let text = `${theme.fg("toolTitle", theme.bold("write"))} ${theme.fg("accent", path || "...")}`;
			if (content) {
				text += theme.fg("dim", ` · ${formatBytes(content.length)} · ${lines.length} line${lines.length === 1 ? "" : "s"}`);
				if (lang) text += theme.fg("dim", ` · ${normalizeShikiLanguage(lang)}`);
				text += `\n${preview.lines.join("\n")}`;
				if (preview.hidden > 0) text += previewFooter(theme, `Showing ${preview.shown} of ${lines.length} lines · ${keyHint("app.tools.expand", "expand")}`);
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
			if (isPartial) return new Text(theme.fg("warning", "Editing…"), 0, 0);

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
			const limit = expanded ? summary.totalLines : toolPreviewSettings.editCollapsedLines;
			const rendered = renderSyntaxHighlightedDiff(diff, lang, theme, limit);

			let text = `${theme.fg("success", `+${summary.additions}`)} ${theme.fg("error", `-${summary.removals}`)}`;
			text += theme.fg("dim", ` in ${filePath || "file"}`);
			text += theme.fg("dim", ` · ${summary.hunks} hunk${summary.hunks === 1 ? "" : "s"}`);
			if (!expanded) text += theme.fg("dim", ` (${keyHint("app.tools.expand", "expand")})`);
			text += `\n${rendered}`;
			if (summary.totalLines > limit) text += previewFooter(theme, `Showing ${limit} of ${summary.totalLines} diff lines · ${keyHint("app.tools.expand", "expand")}`);

			return new FullWidthDiffText(text);
		},
	});
}

const DIFF_ADD_MARKER = "\u0000PI_DIFF_ADD\u0000";
const DIFF_REMOVE_MARKER = "\u0000PI_DIFF_REMOVE\u0000";

class FullWidthDiffText implements Component {
	constructor(private readonly text: string) {}

	render(width: number): string[] {
		return this.text.split("\n").map((rawLine) => {
			const kind = rawLine.startsWith(DIFF_ADD_MARKER)
				? "add"
				: rawLine.startsWith(DIFF_REMOVE_MARKER)
					? "remove"
					: undefined;
			const line = kind === "add"
				? rawLine.slice(DIFF_ADD_MARKER.length)
				: kind === "remove"
					? rawLine.slice(DIFF_REMOVE_MARKER.length)
					: rawLine;

			if (!kind) return truncateToWidth(line, width, "");

			const truncated = truncateToWidth(line, width, "");
			const padding = " ".repeat(Math.max(0, width - visibleWidth(truncated)));
			return diffLineBg(kind, truncated + padding);
		});
	}

	invalidate(): void {}
}

function previewLines(lines: string[], limit: number, theme: Theme): { lines: string[]; shown: number; hidden: number } {
	if (lines.length <= limit || limit <= 0) return { lines, shown: lines.length, hidden: 0 };
	if (limit < 8) return { lines: lines.slice(0, limit), shown: limit, hidden: lines.length - limit };
	const head = Math.ceil(limit * 0.65);
	const tail = Math.max(1, limit - head - 1);
	const hidden = lines.length - head - tail;
	return {
		lines: [
			...lines.slice(0, head),
			theme.fg("muted", `      --- ${hidden} lines hidden ---`),
			...lines.slice(lines.length - tail),
		],
		shown: head + tail,
		hidden,
	};
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} bytes`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getPathArg(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const record = args as Record<string, unknown>;
	const path = record.path ?? record.file_path;
	return typeof path === "string" ? path : "";
}

function getReadStartLine(args: unknown): number {
	if (!args || typeof args !== "object") return 1;
	const offset = (args as Record<string, unknown>).offset;
	return typeof offset === "number" && Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 1;
}

function withOptionalReadLineNumbers(lines: string[], firstLine: number, theme: Theme): string[] {
	if (!toolPreviewSettings.readLineNumbers || lines.length === 0) return lines;
	const lastLine = firstLine + lines.length - 1;
	const width = String(lastLine).length;
	return lines.map((line, index) => {
		const lineNumber = String(firstLine + index).padStart(width, " ");
		return `${theme.fg("toolDiffContext", `${lineNumber} │ `)}${line}`;
	});
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
	return renderWithShiki(normalized, lang) ?? normalized.split("\n").map((line) => theme.fg("toolOutput", line));
}

function renderWithShiki(code: string, lang: string | undefined): string[] | undefined {
	if (!shikiHighlighter || !lang) return undefined;
	const shikiLang = normalizeShikiLanguage(lang);
	try {
		if (!loadedShikiLanguages.has(shikiLang) && !pendingShikiLanguages.has(shikiLang)) {
			pendingShikiLanguages.add(shikiLang);
			shikiHighlighter.loadLanguage(shikiLang as never)
				.then(() => loadedShikiLanguages.add(shikiLang))
				.catch(() => {})
				.finally(() => pendingShikiLanguages.delete(shikiLang));
		}
		const tokens = shikiHighlighter.codeToTokensBase(code, { lang: shikiLang as never, theme: toolPreviewSettings.shikiTheme as never });
		return tokens.map((line) => line.map((token) => ansiFromToken(token)).join(""));
	} catch {
		return undefined;
	}
}

function ansiFromToken(token: { content: string; color?: string; fontStyle?: number }, forceUnderline = false): string {
	let open = token.color ? ansiFg(token.color) : "";
	let close = token.color ? "\x1b[39m" : "";
	// TextMate fontStyle bit flags: italic=1, bold=2, underline=4.
	const fontStyle = token.fontStyle ?? 0;
	if (fontStyle & 2) {
		open += "\x1b[1m";
		close = "\x1b[22m" + close;
	}
	if (fontStyle & 1) {
		open += "\x1b[3m";
		close = "\x1b[23m" + close;
	}
	if ((fontStyle & 4) || forceUnderline) {
		open += "\x1b[4m";
		close = "\x1b[24m" + close;
	}
	return open + escapeControlChars(token.content) + close;
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

function trimTrailingEmptyLines(lines: string[]): string[] {
	let end = lines.length;
	while (end > 0 && lines[end - 1] === "") end--;
	return lines.slice(0, end);
}

function previewFooter(theme: Theme, text: string): string {
	return `\n${theme.fg("muted", `╰─ ${text}`)}`;
}

function summarizeDiff(diff: string): { additions: number; removals: number; totalLines: number; hunks: number } {
	let additions = 0;
	let removals = 0;
	let hunks = 0;
	let inHunk = false;
	const lines = diff.split("\n");
	for (const line of lines) {
		const changed = (line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"));
		if (line.startsWith("+") && !line.startsWith("+++")) additions++;
		else if (line.startsWith("-") && !line.startsWith("---")) removals++;
		if (changed && !inHunk) hunks++;
		inHunk = changed;
	}
	return { additions, removals, totalLines: lines.length, hunks };
}

function renderSyntaxHighlightedDiff(diff: string, lang: string | undefined, theme: Theme, limit: number): string {
	const lines = diff.split("\n");
	const out: string[] = [];

	for (let i = 0; i < Math.min(lines.length, limit); i++) {
		const line = lines[i]!;
		const parsed = parseDiffLine(line);
		if (!parsed) {
			out.push(renderSeparator(line, theme));
			continue;
		}

		if (parsed.kind === "-" && i + 1 < lines.length) {
			const next = parseDiffLine(lines[i + 1]!);
			if (next?.kind === "+") {
				const pair = renderChangedPair(parsed, next, lang, theme);
				out.push(pair.removed, pair.added);
				i++;
				continue;
			}
		}

		out.push(renderDiffParsedLine(parsed, lang, theme));
	}

	return out.join("\n");
}

function renderSeparator(line: string, theme: Theme): string {
	const trimmed = line.trim();
	if (trimmed === "...") return theme.fg("muted", "      --- unchanged lines hidden ---");
	if (trimmed.startsWith("@@")) return theme.fg("accent", theme.bold(line));
	if (trimmed.startsWith("---") || trimmed.startsWith("+++")) return theme.fg("muted", line);
	if (trimmed.startsWith("diff ") || trimmed.startsWith("index ")) return theme.fg("muted", line);
	return theme.fg("toolDiffContext", line);
}

function renderDiffParsedLine(
	parsed: { kind: "+" | "-" | " "; lineNumber: string; content: string },
	lang: string | undefined,
	theme: Theme,
): string {
	const highlighted = highlightSingleLine(parsed.content.replace(/\t/g, "   "), lang, theme);
	if (parsed.kind === "+") return `${DIFF_ADD_MARKER}${theme.fg("toolDiffAdded", `+${parsed.lineNumber} │ `)}${highlighted}`;
	if (parsed.kind === "-") return `${DIFF_REMOVE_MARKER}${theme.fg("toolDiffRemoved", `-${parsed.lineNumber} │ `)}${highlighted}`;
	return dimAnsi(`${theme.fg("toolDiffContext", ` ${parsed.lineNumber} │ `)}${highlighted || theme.fg("toolDiffContext", "")}`);
}

function renderChangedPair(
	removed: { kind: "-"; lineNumber: string; content: string },
	added: { kind: "+"; lineNumber: string; content: string },
	lang: string | undefined,
	theme: Theme,
): { removed: string; added: string } {
	// Keep paired replacements visually stable: full-line diff backgrounds +
	// Shiki syntax colors are readable, while nested word-level ANSI styling can
	// create terminal artifacts in narrow/truncated TUI rows.
	return {
		removed: renderDiffParsedLine(removed, lang, theme),
		added: renderDiffParsedLine(added, lang, theme),
	};
}

function escapeControlChars(text: string): string {
	return text
		.replace(/\x1b/g, "␛")
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "�");
}

function dimAnsi(text: string): string {
	return `\x1b[2m${text}\x1b[22m`;
}

function diffLineBg(kind: "add" | "remove", line: string): string {
	// Full-width subtle backgrounds for changed lines. Re-apply after foreground
	// resets emitted by Shiki so token coloring does not punch holes in the bg.
	if (toolPreviewSettings.diffIntensity === "off") return line;
	const bg = kind === "add"
		? toolPreviewSettings.diffIntensity === "medium" ? "\x1b[48;2;22;68;40m" : "\x1b[48;2;18;58;34m"
		: toolPreviewSettings.diffIntensity === "medium" ? "\x1b[48;2;78;36;40m" : "\x1b[48;2;68;32;36m";
	return bg + line.replace(/\x1b\[39m/g, `\x1b[39m${bg}`) + "\x1b[49m";
}

function parseDiffLine(line: string): { kind: "+" | "-" | " "; lineNumber: string; content: string } | null {
	const match = line.match(/^([+\- ])(\s*\d*)\s(.*)$/);
	if (!match) return null;
	return { kind: match[1] as "+" | "-" | " ", lineNumber: match[2] ?? "", content: match[3] ?? "" };
}

function highlightSingleLine(line: string, lang: string | undefined, theme: Theme): string {
	return renderWithShiki(line, lang)?.[0] ?? theme.fg("toolOutput", line);
}
