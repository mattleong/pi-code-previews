import { defaultCodePreviewSettings } from "./defaults";
import type { CodePreviewSettings } from "./types";

export const codePreviewSettings: CodePreviewSettings = cloneCodePreviewSettings(
  defaultCodePreviewSettings,
);

export function setCodePreviewSettings(next: CodePreviewSettings) {
  Object.assign(codePreviewSettings, cloneCodePreviewSettings(next));
}

export function cloneCodePreviewSettings(settings: CodePreviewSettings): CodePreviewSettings {
  return { ...settings, tools: [...settings.tools] };
}
