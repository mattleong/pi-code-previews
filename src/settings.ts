import { bundledThemes } from "shiki";
import { getObjectValue } from "./data.js";

export type DiffBackgroundIntensity = "off" | "subtle" | "medium";
export type InlineImageMode = "auto" | "off";
export type PathIconMode = "off" | "unicode" | "nerd";

export interface CodePreviewSettings {
	shikiTheme: string;
	diffIntensity: DiffBackgroundIntensity;
	readCollapsedLines: number;
	writeCollapsedLines: number;
	editCollapsedLines: number | "all";
	grepCollapsedLines: number;
	pathListCollapsedLines: number;
	readLineNumbers: boolean;
	bashWarnings: boolean;
	syntaxHighlighting: boolean;
	secretWarnings: boolean;
	inlineImages: InlineImageMode;
	pathIcons: PathIconMode;
}

export const defaultCodePreviewSettings: CodePreviewSettings = {
	shikiTheme: envTheme("CODE_PREVIEW_THEME", "dark-plus"),
	diffIntensity: envDiffIntensity("CODE_PREVIEW_DIFF_INTENSITY", "subtle"),
	readCollapsedLines: envNumber("CODE_PREVIEW_READ_LINES", 10),
	writeCollapsedLines: envNumber("CODE_PREVIEW_WRITE_LINES", 10),
	editCollapsedLines: envEditLines("CODE_PREVIEW_EDIT_LINES", 160),
	grepCollapsedLines: envNumber("CODE_PREVIEW_GREP_LINES", 15),
	pathListCollapsedLines: envNumber("CODE_PREVIEW_PATH_LIST_LINES", 20),
	readLineNumbers: envBoolean("CODE_PREVIEW_READ_LINE_NUMBERS", true),
	bashWarnings: envBoolean("CODE_PREVIEW_BASH_WARNINGS", true),
	syntaxHighlighting: envBoolean("CODE_PREVIEW_SYNTAX", true),
	secretWarnings: envBoolean("CODE_PREVIEW_SECRET_WARNINGS", true),
	inlineImages: envInlineImageMode("CODE_PREVIEW_INLINE_IMAGES", "auto"),
	pathIcons: envPathIconMode("CODE_PREVIEW_PATH_ICONS", "unicode"),
};

export let codePreviewSettings: CodePreviewSettings = { ...defaultCodePreviewSettings };

export function setCodePreviewSettings(next: CodePreviewSettings) {
	codePreviewSettings = next;
}

export function normalizeSettings(data: unknown, fallback: CodePreviewSettings = codePreviewSettings): CodePreviewSettings {
	const shikiTheme = getObjectValue(data, "shikiTheme");
	const diffIntensity = getObjectValue(data, "diffIntensity");
	const readLineNumbers = getObjectValue(data, "readLineNumbers");
	const bashWarnings = getObjectValue(data, "bashWarnings");
	const syntaxHighlighting = getObjectValue(data, "syntaxHighlighting");
	const secretWarnings = getObjectValue(data, "secretWarnings");
	const inlineImages = getObjectValue(data, "inlineImages");
	const pathIcons = getObjectValue(data, "pathIcons");
	return {
		shikiTheme: isBundledThemeName(shikiTheme) ? shikiTheme : fallback.shikiTheme,
		diffIntensity: isDiffBackgroundIntensity(diffIntensity) ? diffIntensity : fallback.diffIntensity,
		readCollapsedLines: coerceNumber(getObjectValue(data, "readCollapsedLines"), fallback.readCollapsedLines),
		writeCollapsedLines: coerceNumber(getObjectValue(data, "writeCollapsedLines"), fallback.writeCollapsedLines),
		editCollapsedLines: coerceEditPreviewLines(getObjectValue(data, "editCollapsedLines"), fallback.editCollapsedLines),
		grepCollapsedLines: coerceNumber(getObjectValue(data, "grepCollapsedLines"), fallback.grepCollapsedLines),
		pathListCollapsedLines: coerceNumber(getObjectValue(data, "pathListCollapsedLines"), fallback.pathListCollapsedLines),
		readLineNumbers: typeof readLineNumbers === "boolean" ? readLineNumbers : fallback.readLineNumbers,
		bashWarnings: typeof bashWarnings === "boolean" ? bashWarnings : fallback.bashWarnings,
		syntaxHighlighting: typeof syntaxHighlighting === "boolean" ? syntaxHighlighting : fallback.syntaxHighlighting,
		secretWarnings: typeof secretWarnings === "boolean" ? secretWarnings : fallback.secretWarnings,
		inlineImages: isInlineImageMode(inlineImages) ? inlineImages : fallback.inlineImages,
		pathIcons: isPathIconMode(pathIcons) ? pathIcons : fallback.pathIcons,
	};
}

export function updateSetting(current: CodePreviewSettings, id: string, value: string): CodePreviewSettings {
	const next = { ...current };
	if (id === "shikiTheme" && isBundledThemeName(value)) next.shikiTheme = value;
	else if (id === "diffIntensity" && isDiffBackgroundIntensity(value)) next.diffIntensity = value;
	else if (id === "readCollapsedLines") next.readCollapsedLines = coerceStringNumber(value, current.readCollapsedLines);
	else if (id === "writeCollapsedLines") next.writeCollapsedLines = coerceStringNumber(value, current.writeCollapsedLines);
	else if (id === "editCollapsedLines") next.editCollapsedLines = value === "all" ? "all" : coerceStringNumber(value, typeof current.editCollapsedLines === "number" ? current.editCollapsedLines : 100);
	else if (id === "grepCollapsedLines") next.grepCollapsedLines = coerceStringNumber(value, current.grepCollapsedLines);
	else if (id === "pathListCollapsedLines") next.pathListCollapsedLines = coerceStringNumber(value, current.pathListCollapsedLines);
	else if (id === "readLineNumbers") next.readLineNumbers = value === "on";
	else if (id === "bashWarnings") next.bashWarnings = value === "on";
	else if (id === "syntaxHighlighting") next.syntaxHighlighting = value === "on";
	else if (id === "secretWarnings") next.secretWarnings = value === "on";
	else if (id === "inlineImages" && isInlineImageMode(value)) next.inlineImages = value;
	else if (id === "pathIcons" && isPathIconMode(value)) next.pathIcons = value;
	else if (id === "resetToDefaults" && value === "reset now") return { ...defaultCodePreviewSettings };
	return next;
}

function envTheme(name: string, fallback: string): string {
	const value = process.env[name];
	return isBundledThemeName(value) ? value : fallback;
}

function envNumber(name: string, fallback: number): number {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function envBoolean(name: string, fallback: boolean): boolean {
	const value = process.env[name]?.toLowerCase();
	if (value === undefined) return fallback;
	return value === "1" || value === "true" || value === "on" || value === "yes";
}

function envEditLines(name: string, fallback: number | "all"): number | "all" {
	const value = process.env[name];
	if (value === "all") return "all";
	const numeric = Number(value);
	return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function envDiffIntensity(name: string, fallback: DiffBackgroundIntensity): DiffBackgroundIntensity {
	const value = process.env[name];
	return isDiffBackgroundIntensity(value) ? value : fallback;
}

function envInlineImageMode(name: string, fallback: InlineImageMode): InlineImageMode {
	const value = process.env[name]?.toLowerCase();
	return isInlineImageMode(value) ? value : fallback;
}

function envPathIconMode(name: string, fallback: PathIconMode): PathIconMode {
	const value = process.env[name]?.toLowerCase();
	return isPathIconMode(value) ? value : fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function coerceStringNumber(value: string, fallback: number): number {
	const numeric = Number(value);
	return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function coerceEditPreviewLines(value: unknown, fallback: number | "all"): number | "all" {
	if (value === "all") return "all";
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
	return fallback;
}

function isDiffBackgroundIntensity(value: unknown): value is DiffBackgroundIntensity {
	return value === "off" || value === "subtle" || value === "medium";
}

function isInlineImageMode(value: unknown): value is InlineImageMode {
	return value === "auto" || value === "off";
}

function isPathIconMode(value: unknown): value is PathIconMode {
	return value === "off" || value === "unicode" || value === "nerd";
}

function isBundledThemeName(value: unknown): value is string {
	return typeof value === "string" && value in bundledThemes;
}
