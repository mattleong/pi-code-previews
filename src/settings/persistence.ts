import { cloneCodePreviewSettings, type CodePreviewSettings } from "./index";
import { saveSettingsToDisk } from "./store";

let settingsSaveQueue: Promise<void> = Promise.resolve();

export function queueSettingsSave(settings: CodePreviewSettings): Promise<void> {
  const snapshot = cloneCodePreviewSettings(settings);
  const nextSave = settingsSaveQueue
    .catch(() => undefined)
    .then(() => saveSettingsToDisk(snapshot));
  settingsSaveQueue = nextSave;
  return nextSave;
}

export function flushSettingsSaveQueue(): Promise<void> {
  return settingsSaveQueue;
}

export function formatSettingsSaveError(error: unknown): string {
  return `Failed to save code preview settings: ${error instanceof Error ? error.message : String(error)}`;
}
