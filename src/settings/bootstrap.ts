import { defaultCodePreviewSettings } from "./defaults";
import { cloneCodePreviewSettings, codePreviewSettings, setCodePreviewSettings } from "./state";
import { loadSettingsFromDisk } from "./store";
import type { CodePreviewSettings } from "./types";

export async function loadCodePreviewSettings(projectCwd?: string): Promise<CodePreviewSettings> {
  const savedSettings = await loadSettingsFromDisk({ projectCwd });
  setCodePreviewSettings(savedSettings ?? defaultCodePreviewSettings);
  return cloneCodePreviewSettings(codePreviewSettings);
}
