import { codePreviewSettings } from "../settings/index";
import { ALL_CODE_PREVIEW_TOOLS, parseCodePreviewTools, type CodePreviewToolName } from "./names";
import { formatToolsSettingValue, getRequiredCodePreviewTools } from "./policy";

export function getEnabledCodePreviewTools(): Set<CodePreviewToolName> {
  const enabled =
    parseCodePreviewTools(process.env.CODE_PREVIEW_TOOLS) ?? new Set(codePreviewSettings.tools);
  for (const tool of getRequiredCodePreviewTools(codePreviewSettings)) enabled.add(tool);
  return enabled;
}

export function formatEnabledCodePreviewTools(enabled = getEnabledCodePreviewTools()): string {
  return formatToolsSettingValue(ALL_CODE_PREVIEW_TOOLS.filter((tool) => enabled.has(tool)));
}
