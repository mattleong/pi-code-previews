import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { isFileNotFound } from "../shared/errors";
import {
  CODE_PREVIEW_SETTING_KEYS,
  cloneCodePreviewSettings,
  defaultCodePreviewSettings,
  normalizeSettings,
  type CodePreviewSettings,
} from "./index";

export function getSettingsPath(): string {
  return join(getAgentDir(), "code-previews.json");
}

function getLegacyAgentDir(): string {
  return join(homedir(), ".pi", "agent");
}

function getLegacySettingsPath(): string {
  return join(getLegacyAgentDir(), "code-previews.json");
}

export type LoadSettingsOptions = {
  projectCwd?: string;
};

export async function loadSettingsFromDisk(
  options: LoadSettingsOptions = {},
): Promise<CodePreviewSettings | undefined> {
  let loaded = false;
  let effective = cloneCodePreviewSettings(defaultCodePreviewSettings);
  const projectCwd = options.projectCwd ?? process.cwd();
  const settingsPaths = [
    join(homedir(), ".pi", "settings.json"),
    join(getLegacyAgentDir(), "settings.json"),
    join(getAgentDir(), "settings.json"),
    join(projectCwd, ".pi", "settings.json"),
    getLegacySettingsPath(),
    getSettingsPath(),
  ];
  for (const settingsPath of new Set(settingsPaths)) {
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

export function extractCodePreviewSettings(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const object = data as Record<string, unknown>;
  const nested = object.codePreview;
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  if (hasDirectCodePreviewSettings(object)) return object;
  const extracted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (!key.startsWith("codePreview")) continue;
    const normalized = key.slice("codePreview".length);
    if (!normalized) continue;
    extracted[normalized[0]!.toLowerCase() + normalized.slice(1)] = value;
  }
  return extracted;
}

function hasDirectCodePreviewSettings(object: Record<string, unknown>): boolean {
  return CODE_PREVIEW_SETTING_KEYS.some((key) => key in object);
}
