import type { Theme } from "@mariozechner/pi-coding-agent";
import { createHighlighter } from "shiki";
import { setCodePreviewSettings, codePreviewSettings } from "./settings.js";

let shikiHighlighter: Awaited<ReturnType<typeof createHighlighter>> | undefined;
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
	"dotenv",
	"makefile",
	"properties",
] as const;

export async function initializeShiki(theme: string) {
	try {
		const previousHighlighter = shikiHighlighter;
		const nextHighlighter = await createHighlighter({ themes: [theme], langs: [...PRELOADED_SHIKI_LANGUAGES] });
		previousHighlighter?.dispose();
		shikiHighlighter = nextHighlighter;
		setCodePreviewSettings({ ...codePreviewSettings, shikiTheme: theme });
		loadedShikiLanguages.clear();
		for (const lang of PRELOADED_SHIKI_LANGUAGES) loadedShikiLanguages.add(lang);
	} catch (error) {
		console.warn("[pi-code-previews] Shiki failed to initialize; previews will be plain text.", error);
		shikiHighlighter = undefined;
	}
}

export function renderHighlightedText(text: string, lang: string | undefined, theme: Theme): string[] {
	const normalized = text.replace(/\t/g, "   ");
	if (!codePreviewSettings.syntaxHighlighting || !lang) return normalized.split("\n").map((line) => theme.fg("toolOutput", line));
	return renderWithShiki(normalized, lang) ?? normalized.split("\n").map((line) => theme.fg("toolOutput", line));
}

export function renderWithShiki(code: string, lang: string | undefined): string[] | undefined {
	if (!codePreviewSettings.syntaxHighlighting || !shikiHighlighter || !lang) return undefined;
	const shikiLang = normalizeShikiLanguage(lang);
	try {
		if (!loadedShikiLanguages.has(shikiLang) && !pendingShikiLanguages.has(shikiLang)) {
			pendingShikiLanguages.add(shikiLang);
			shikiHighlighter.loadLanguage(shikiLang as never)
				.then(() => loadedShikiLanguages.add(shikiLang))
				.catch(() => {})
				.finally(() => pendingShikiLanguages.delete(shikiLang));
		}
		const tokens = shikiHighlighter.codeToTokensBase(code, { lang: shikiLang as never, theme: codePreviewSettings.shikiTheme as never });
		return tokens.map((line) => line.map((token) => ansiFromToken(token)).join(""));
	} catch {
		return undefined;
	}
}

export function normalizeShikiLanguage(lang: string): string {
	const normalized = lang.toLowerCase();
	if (normalized === "sh" || normalized === "shell" || normalized === "zsh") return "bash";
	if (normalized === "shell-session" || normalized === "shellsession" || normalized === "terminal" || normalized === "console") return "shellscript";
	if (normalized === "ts") return "typescript";
	if (normalized === "js") return "javascript";
	if (normalized === "md") return "markdown";
	if (normalized === "yml") return "yaml";
	return normalized;
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

export function escapeControlChars(text: string): string {
	return text
		.replace(/\x1b/g, "␛")
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "�");
}
