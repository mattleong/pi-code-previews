import { getObjectValue } from "../shared/objects";
import {
  ALL_CODE_PREVIEW_TOOLS,
  parseToolToggleId,
  type CodePreviewToolName,
} from "../tools/names";
import { formatToolsSettingValue, getEffectiveCodePreviewTools } from "../tools/policy";
import {
  CODE_PREVIEW_SETTING_DEFINITIONS,
  CODE_PREVIEW_SETTING_KEYS,
  getSettingDefinition,
  type CodePreviewSettingDescriptor,
} from "./definitions";
import { defaultCodePreviewSettings } from "./defaults";
import { formatOnOff } from "./on-off";
import { cloneCodePreviewSettings, codePreviewSettings } from "./state";
import type { CodePreviewEditableSettingId, CodePreviewSettings } from "./types";

export function formatSettingValue(
  settings: CodePreviewSettings,
  id: CodePreviewEditableSettingId,
): string {
  if (id === "resetToDefaults") return "keep current";
  if (id === "tools") return formatToolsSettingValue(settings.tools);
  const value = settings[id];
  if (typeof value === "boolean") return formatOnOff(value);
  return String(value);
}

export function normalizeSettings(
  data: unknown,
  fallback: CodePreviewSettings = codePreviewSettings,
): CodePreviewSettings {
  const next = {} as CodePreviewSettings;
  for (const key of CODE_PREVIEW_SETTING_KEYS) normalizeSetting(next, data, fallback, key);
  return withRequiredToolRenderers(next);
}

function normalizeSetting<K extends keyof CodePreviewSettings>(
  next: CodePreviewSettings,
  data: unknown,
  fallback: CodePreviewSettings,
  key: K,
): void {
  const definition = CODE_PREVIEW_SETTING_DEFINITIONS[
    key
  ] as unknown as CodePreviewSettingDescriptor<K>;
  next[key] = definition.normalize(getObjectValue(data, key), fallback[key]);
}

export function updateSetting(
  current: CodePreviewSettings,
  id: string,
  value: string,
): CodePreviewSettings {
  if (id === "resetToDefaults" && value === "reset now")
    return cloneCodePreviewSettings(defaultCodePreviewSettings);

  const next = cloneCodePreviewSettings(current);
  const definition = getSettingDefinition(id);
  if (definition) definition.update(next, current, value);
  else {
    const tool = parseToolToggleId(id);
    if (tool) next.tools = updateToolToggle(current.tools, tool, value);
  }
  return withRequiredToolRenderers(next);
}

function withRequiredToolRenderers(settings: CodePreviewSettings): CodePreviewSettings {
  return {
    ...settings,
    tools: getEffectiveCodePreviewTools(settings.tools, settings),
  };
}

function updateToolToggle(
  currentTools: CodePreviewToolName[],
  tool: CodePreviewToolName,
  value: string,
): CodePreviewToolName[] {
  const enabled = new Set(currentTools);
  if (value === "on") enabled.add(tool);
  else if (value === "off") enabled.delete(tool);
  return ALL_CODE_PREVIEW_TOOLS.filter((candidate) => enabled.has(candidate));
}
