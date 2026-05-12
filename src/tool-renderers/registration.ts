import type { ExtensionAPI, ToolInfo } from "@earendil-works/pi-coding-agent";
import { getBuiltinToolOptions, type BuiltinToolOptions } from "../tools/builtin-options";
import { ALL_CODE_PREVIEW_TOOLS, type CodePreviewToolName } from "../tools/names";
import { getEnabledCodePreviewTools } from "../tools/selection";
import { resetCodePreviewToolStatuses, setCodePreviewToolStatus } from "../tools/status";
import { registerBash } from "./bash";
import { registerEdit } from "./edit";
import { registerFind } from "./find";
import { registerGrep } from "./grep";
import { registerLs } from "./ls";
import { registerRead } from "./read";
import { registerWrite } from "./write";

export interface RegisterToolRenderersOptions {
  registeredTools?: Set<CodePreviewToolName>;
  activatedTools?: Set<CodePreviewToolName>;
  toolOptions?: BuiltinToolOptions;
}

type ToolRendererRegistration = (
  pi: ExtensionAPI,
  cwd: string,
  options: BuiltinToolOptions,
) => void;

const TOOL_RENDERER_REGISTRATIONS = {
  bash: (pi, cwd, options) => registerBash(pi, cwd, options.bash),
  read: (pi, cwd, options) => registerRead(pi, cwd, options.read),
  write: (pi, cwd) => registerWrite(pi, cwd),
  edit: (pi, cwd) => registerEdit(pi, cwd),
  grep: (pi, cwd) => registerGrep(pi, cwd),
  find: (pi, cwd) => registerFind(pi, cwd),
  ls: (pi, cwd) => registerLs(pi, cwd),
} satisfies Record<CodePreviewToolName, ToolRendererRegistration>;

export function registerToolRenderers(
  pi: ExtensionAPI,
  cwd: string,
  options: RegisterToolRenderersOptions = {},
) {
  const enabledTools = getEnabledCodePreviewTools();
  resetCodePreviewToolStatuses(enabledTools);
  const existingTools = getExistingToolsByName(pi);
  const toolOptions = options.toolOptions ?? getBuiltinToolOptions(cwd);
  const activePreviewTools = new Set<CodePreviewToolName>();

  for (const tool of ALL_CODE_PREVIEW_TOOLS) {
    if (!enabledTools.has(tool)) continue;
    if (options.registeredTools?.has(tool)) {
      setCodePreviewToolStatus(tool, { state: "active" });
      activePreviewTools.add(tool);
      continue;
    }

    const existing = existingTools.get(tool);
    if (existing && existing.sourceInfo.source !== "builtin") {
      setCodePreviewToolStatus(tool, { state: "skipped-conflict", owner: existing.sourceInfo });
      continue;
    }

    TOOL_RENDERER_REGISTRATIONS[tool](pi, cwd, toolOptions);
    options.registeredTools?.add(tool);
    activePreviewTools.add(tool);
    setCodePreviewToolStatus(tool, { state: "active" });
  }

  syncActiveCodePreviewTools(pi, activePreviewTools, options.activatedTools);
}

function syncActiveCodePreviewTools(
  pi: ExtensionAPI,
  desiredTools: Set<CodePreviewToolName>,
  activatedTools: Set<CodePreviewToolName> | undefined,
): void {
  if (desiredTools.size === 0 && (!activatedTools || activatedTools.size === 0)) return;
  const getActiveTools = (pi as Partial<ExtensionAPI>).getActiveTools;
  const setActiveTools = (pi as Partial<ExtensionAPI>).setActiveTools;
  if (typeof getActiveTools !== "function" || typeof setActiveTools !== "function") return;
  try {
    const current = getActiveTools.call(pi);
    const currentSet = new Set(current);
    const additions = [...desiredTools].filter((tool) => !currentSet.has(tool));
    const removals = activatedTools
      ? [...activatedTools].filter((tool) => !desiredTools.has(tool))
      : [];
    const removalsInCurrent = new Set(removals.filter((tool) => currentSet.has(tool)));
    const next = current.filter((tool) => !removalsInCurrent.has(tool as CodePreviewToolName));
    next.push(...additions);
    if (additions.length > 0 || removalsInCurrent.size > 0) setActiveTools.call(pi, next);
    for (const tool of additions) activatedTools?.add(tool);
    for (const tool of removals) activatedTools?.delete(tool);
  } catch {
    // Tool activation is best effort for older pi versions.
  }
}

function getExistingToolsByName(pi: ExtensionAPI): Map<string, ToolInfo> {
  const getAllTools = (pi as Partial<ExtensionAPI>).getAllTools;
  if (typeof getAllTools !== "function") return new Map();
  try {
    return new Map(getAllTools.call(pi).map((tool) => [tool.name, tool]));
  } catch {
    return new Map();
  }
}
