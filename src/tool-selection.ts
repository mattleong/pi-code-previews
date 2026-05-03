import { codePreviewSettings } from "./settings.ts";
import {
  ALL_CODE_PREVIEW_TOOLS,
  isCodePreviewToolName,
  parseCodePreviewTools,
  type CodePreviewToolName,
} from "./tool-names.ts";

export { ALL_CODE_PREVIEW_TOOLS, isCodePreviewToolName, type CodePreviewToolName };

export function getEnabledCodePreviewTools(): Set<CodePreviewToolName> {
  const envTools = parseCodePreviewTools(process.env.CODE_PREVIEW_TOOLS);
  if (envTools) return envTools;
  return new Set(codePreviewSettings.tools);
}

export function isCodePreviewToolEnabled(
  name: CodePreviewToolName,
  enabled = getEnabledCodePreviewTools(),
): boolean {
  return enabled.has(name);
}

export function formatEnabledCodePreviewTools(enabled = getEnabledCodePreviewTools()): string {
  return ALL_CODE_PREVIEW_TOOLS.filter((tool) => enabled.has(tool)).join(", ") || "none";
}
