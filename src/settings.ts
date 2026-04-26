import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { bundledThemes } from "shiki";
import { getObjectValue } from "./data.js";

export const SETTINGS_STATE_TYPE = "tool-preview-settings";

export type DiffBackgroundIntensity = "off" | "subtle" | "medium";

export interface ToolPreviewSettings {
	shikiTheme: string;
	diffIntensity: DiffBackgroundIntensity;
	readCollapsedLines: number;
	writeCollapsedLines: number;
	editCollapsedLines: number;
	readLineNumbers: boolean;
}

export let toolPreviewSettings: ToolPreviewSettings = {
	shikiTheme: "dark-plus",
	diffIntensity: "subtle",
	readCollapsedLines: 20,
	writeCollapsedLines: 20,
	editCollapsedLines: 100,
	readLineNumbers: true,
};

export function setToolPreviewSettings(next: ToolPreviewSettings) {
	toolPreviewSettings = next;
}

export function restoreSettings(ctx: ExtensionContext) {
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === SETTINGS_STATE_TYPE) {
			toolPreviewSettings = normalizeSettings(entry.data);
		}
	}
}

export function normalizeSettings(data: unknown): ToolPreviewSettings {
	const shikiTheme = getObjectValue(data, "shikiTheme");
	const diffIntensity = getObjectValue(data, "diffIntensity");
	const readLineNumbers = getObjectValue(data, "readLineNumbers");
	return {
		shikiTheme: isBundledThemeName(shikiTheme) ? shikiTheme : toolPreviewSettings.shikiTheme,
		diffIntensity: isDiffBackgroundIntensity(diffIntensity) ? diffIntensity : toolPreviewSettings.diffIntensity,
		readCollapsedLines: coerceNumber(getObjectValue(data, "readCollapsedLines"), toolPreviewSettings.readCollapsedLines),
		writeCollapsedLines: coerceNumber(getObjectValue(data, "writeCollapsedLines"), toolPreviewSettings.writeCollapsedLines),
		editCollapsedLines: coerceNumber(getObjectValue(data, "editCollapsedLines"), toolPreviewSettings.editCollapsedLines),
		readLineNumbers: typeof readLineNumbers === "boolean" ? readLineNumbers : toolPreviewSettings.readLineNumbers,
	};
}

export function updateSetting(current: ToolPreviewSettings, id: string, value: string): ToolPreviewSettings {
	const next = { ...current };
	if (id === "shikiTheme" && isBundledThemeName(value)) next.shikiTheme = value;
	else if (id === "diffIntensity" && isDiffBackgroundIntensity(value)) next.diffIntensity = value;
	else if (id === "readCollapsedLines") next.readCollapsedLines = Number(value);
	else if (id === "writeCollapsedLines") next.writeCollapsedLines = Number(value);
	else if (id === "editCollapsedLines") next.editCollapsedLines = Number(value);
	else if (id === "readLineNumbers") next.readLineNumbers = value === "on";
	return next;
}

function coerceNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isDiffBackgroundIntensity(value: unknown): value is DiffBackgroundIntensity {
	return value === "off" || value === "subtle" || value === "medium";
}

function isBundledThemeName(value: unknown): value is string {
	return typeof value === "string" && value in bundledThemes;
}
