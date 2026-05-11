import { ALL_CODE_PREVIEW_TOOLS, type CodePreviewToolName } from "./names";

interface RequiredToolSettings {
  readContentPreview: boolean;
  writeContentPreview: boolean;
  editDiffPreview: boolean;
  bashResultPreview: boolean;
  grepResultPreview: boolean;
  findResultPreview: boolean;
  lsResultPreview: boolean;
}

export function formatToolsSettingValue(tools: readonly CodePreviewToolName[]): string {
  return tools.length ? tools.join(", ") : "none";
}

export function getRequiredCodePreviewTools(
  settings: RequiredToolSettings,
): Set<CodePreviewToolName> {
  const tools = new Set<CodePreviewToolName>();
  if (!settings.readContentPreview) tools.add("read");
  if (!settings.writeContentPreview) tools.add("write");
  if (!settings.editDiffPreview) tools.add("edit");
  if (!settings.grepResultPreview) tools.add("grep");
  if (!settings.findResultPreview) tools.add("find");
  if (!settings.lsResultPreview) tools.add("ls");
  if (
    !settings.bashResultPreview ||
    !settings.grepResultPreview ||
    !settings.findResultPreview ||
    !settings.lsResultPreview
  )
    tools.add("bash");
  return tools;
}

export function getEffectiveCodePreviewToolSet(
  configuredTools: Iterable<CodePreviewToolName>,
  settings: RequiredToolSettings,
): Set<CodePreviewToolName> {
  const enabled = new Set(configuredTools);
  for (const tool of getRequiredCodePreviewTools(settings)) enabled.add(tool);
  return enabled;
}

export function getEffectiveCodePreviewTools(
  configuredTools: Iterable<CodePreviewToolName>,
  settings: RequiredToolSettings,
): CodePreviewToolName[] {
  return orderCodePreviewTools(getEffectiveCodePreviewToolSet(configuredTools, settings));
}

export function orderCodePreviewTools(tools: Iterable<CodePreviewToolName>): CodePreviewToolName[] {
  const enabled = new Set(tools);
  return ALL_CODE_PREVIEW_TOOLS.filter((tool) => enabled.has(tool));
}
