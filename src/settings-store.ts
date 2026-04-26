import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { normalizeSettings, type CodePreviewSettings } from "./settings.js";

export function getSettingsPath(): string {
	return join(homedir(), ".pi", "agent", "code-previews.json");
}

export async function loadSettingsFromDisk(): Promise<CodePreviewSettings | undefined> {
	try {
		const content = await readFile(getSettingsPath(), "utf8");
		return normalizeSettings(JSON.parse(content));
	} catch (error) {
		if (isFileNotFound(error)) return undefined;
		console.warn(`[pi-code-previews] Failed to load settings from ${getSettingsPath()}. Using defaults.`, error);
		return undefined;
	}
}

export async function saveSettingsToDisk(settings: CodePreviewSettings): Promise<void> {
	const settingsPath = getSettingsPath();
	await mkdir(dirname(settingsPath), { recursive: true });
	await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function isFileNotFound(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
