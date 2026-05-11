import { codePreviewSettings } from "../settings/index";
import { ALL_CODE_PREVIEW_TOOLS, parseCodePreviewTools, type CodePreviewToolName } from "./names";
import { formatToolsSettingValue, getEffectiveCodePreviewToolSet } from "./policy";

export function getEnabledCodePreviewTools(): Set<CodePreviewToolName> {
  const configured =
    parseCodePreviewTools(process.env.CODE_PREVIEW_TOOLS) ?? codePreviewSettings.tools;
  return getEffectiveCodePreviewToolSet(configured, codePreviewSettings);
}

export function formatEnabledCodePreviewTools(enabled = getEnabledCodePreviewTools()): string {
  return formatToolsSettingValue(ALL_CODE_PREVIEW_TOOLS.filter((tool) => enabled.has(tool)));
}
