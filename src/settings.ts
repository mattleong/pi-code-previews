import { bundledThemes } from "shiki";
import { getObjectValue } from "./data.js";

export type DiffBackgroundIntensity = "off" | "subtle" | "medium";

export interface CodePreviewSettings {
	shikiTheme: string;
	diffIntensity: DiffBackgroundIntensity;
	readCollapsedLines: number;
	writeCollapsedLines: number;
	editCollapsedLines: number | "all";
	readLineNumbers: boolean;
	bashWarnings: boolean;
	syntaxHighlighting: boolean;
}

export const defaultCodePreviewSettings: CodePreviewSettings = {
	shikiTheme: "dark-plus",
	diffIntensity: "subtle",
	readCollapsedLines: 10,
	writeCollapsedLines: 10,
	editCollapsedLines: "all",
	readLineNumbers: true,
	bashWarnings: true,
	syntaxHighlighting: true,
};

export let codePreviewSettings: CodePreviewSettings = { ...defaultCodePreviewSettings };

export function setCodePreviewSettings(next: CodePreviewSettings) {
	codePreviewSettings = next;
}

export function normalizeSettings(data: unknown): CodePreviewSettings {
	const shikiTheme = getObjectValue(data, "shikiTheme");
	const diffIntensity = getObjectValue(data, "diffIntensity");
	const readLineNumbers = getObjectValue(data, "readLineNumbers");
	const bashWarnings = getObjectValue(data, "bashWarnings");
	const syntaxHighlighting = getObjectValue(data, "syntaxHighlighting");
	return {
		shikiTheme: isBundledThemeName(shikiTheme) ? shikiTheme : codePreviewSettings.shikiTheme,
		diffIntensity: isDiffBackgroundIntensity(diffIntensity) ? diffIntensity : codePreviewSettings.diffIntensity,
		readCollapsedLines: coerceNumber(getObjectValue(data, "readCollapsedLines"), codePreviewSettings.readCollapsedLines),
		writeCollapsedLines: coerceNumber(getObjectValue(data, "writeCollapsedLines"), codePreviewSettings.writeCollapsedLines),
		editCollapsedLines: coerceEditPreviewLines(getObjectValue(data, "editCollapsedLines"), codePreviewSettings.editCollapsedLines),
		readLineNumbers: typeof readLineNumbers === "boolean" ? readLineNumbers : codePreviewSettings.readLineNumbers,
		bashWarnings: typeof bashWarnings === "boolean" ? bashWarnings : codePreviewSettings.bashWarnings,
		syntaxHighlighting: typeof syntaxHighlighting === "boolean" ? syntaxHighlighting : codePreviewSettings.syntaxHighlighting,
	};
}

export function updateSetting(current: CodePreviewSettings, id: string, value: string): CodePreviewSettings {
	const next = { ...current };
	if (id === "shikiTheme" && isBundledThemeName(value)) next.shikiTheme = value;
	else if (id === "diffIntensity" && isDiffBackgroundIntensity(value)) next.diffIntensity = value;
	else if (id === "readCollapsedLines") next.readCollapsedLines = Number(value);
	else if (id === "writeCollapsedLines") next.writeCollapsedLines = Number(value);
	else if (id === "editCollapsedLines") next.editCollapsedLines = value === "all" ? "all" : Number(value);
	else if (id === "readLineNumbers") next.readLineNumbers = value === "on";
	else if (id === "bashWarnings") next.bashWarnings = value === "on";
	else if (id === "syntaxHighlighting") next.syntaxHighlighting = value === "on";
	else if (id === "resetToDefaults" && value === "reset now") return { ...defaultCodePreviewSettings };
	return next;
}

function coerceNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coerceEditPreviewLines(value: unknown, fallback: number | "all"): number | "all" {
	if (value === "all") return "all";
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isDiffBackgroundIntensity(value: unknown): value is DiffBackgroundIntensity {
	return value === "off" || value === "subtle" || value === "medium";
}

function isBundledThemeName(value: unknown): value is string {
	return typeof value === "string" && value in bundledThemes;
}
