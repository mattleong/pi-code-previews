import {
  cloneCodePreviewSettings,
  codePreviewSettings,
  setCodePreviewSettings,
  type CodePreviewSettings,
} from "./index";
import { loadSettingsFromDisk } from "./store";

export async function loadCodePreviewSettings(projectCwd?: string): Promise<CodePreviewSettings> {
  const savedSettings = await loadSettingsFromDisk({ projectCwd });
  if (savedSettings) setCodePreviewSettings(savedSettings);
  return cloneCodePreviewSettings(codePreviewSettings);
}
