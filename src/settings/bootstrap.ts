import {
  cloneCodePreviewSettings,
  codePreviewSettings,
  defaultCodePreviewSettings,
  setCodePreviewSettings,
  type CodePreviewSettings,
} from "./index";
import { loadSettingsFromDisk } from "./store";

export async function loadCodePreviewSettings(projectCwd?: string): Promise<CodePreviewSettings> {
  const savedSettings = await loadSettingsFromDisk({ projectCwd });
  setCodePreviewSettings(savedSettings ?? defaultCodePreviewSettings);
  return cloneCodePreviewSettings(codePreviewSettings);
}
