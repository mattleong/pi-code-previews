import {
  cloneCodePreviewSettings,
  codePreviewSettings,
  setCodePreviewSettings,
  type CodePreviewSettings,
} from "./index";
import { loadSettingsFromDisk } from "./store";

export async function loadCodePreviewSettings(): Promise<CodePreviewSettings> {
  const savedSettings = await loadSettingsFromDisk();
  if (savedSettings) setCodePreviewSettings(savedSettings);
  return cloneCodePreviewSettings(codePreviewSettings);
}
