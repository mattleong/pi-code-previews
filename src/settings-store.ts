import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { codePreviewSettings, normalizeSettings, type CodePreviewSettings } from "./settings.js";

export function getSettingsPath(): string {
	return join(homedir(), ".pi", "agent", "code-previews.json");
}

export async function loadSettingsFromDisk(): Promise<CodePreviewSettings | undefined> {
	let loaded = false;
	let effective = codePreviewSettings;
	for (const settingsPath of [join(homedir(), ".pi", "settings.json"), join(process.cwd(), ".pi", "settings.json"), getSettingsPath()]) {
		try {
			const content = await readFile(settingsPath, "utf8");
			effective = normalizeSettings(extractCodePreviewSettings(JSON.parse(content)), effective);
			loaded = true;
		} catch (error) {
			if (isFileNotFound(error)) continue;
			console.warn(`[pi-code-previews] Failed to load settings from ${settingsPath}.`, error);
		}
	}
	return loaded ? effective : undefined;
}

export async function saveSettingsToDisk(settings: CodePreviewSettings): Promise<void> {
	const settingsPath = getSettingsPath();
	await mkdir(dirname(settingsPath), { recursive: true });
	await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function extractCodePreviewSettings(data: unknown): Record<string, unknown> {
	if (!data || typeof data !== "object") return {};
	const object = data as Record<string, unknown>;
	const nested = object.codePreview;
	if (nested && typeof nested === "object") return nested as Record<string, unknown>;
	const extracted: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(object)) {
		if (!key.startsWith("codePreview")) continue;
		const normalized = key.slice("codePreview".length);
		if (!normalized) continue;
		extracted[normalized[0]!.toLowerCase() + normalized.slice(1)] = value;
	}
	return extracted;
}

function isFileNotFound(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
