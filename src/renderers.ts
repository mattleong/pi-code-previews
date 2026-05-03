import type { ExtensionAPI, ToolInfo } from "@mariozechner/pi-coding-agent";
import { registerBash } from "./tool-renderers/bash.ts";
import { registerEdit } from "./tool-renderers/edit.ts";
import { registerFind } from "./tool-renderers/find.ts";
import { registerGrep } from "./tool-renderers/grep.ts";
import { registerLs } from "./tool-renderers/ls.ts";
import { registerRead } from "./tool-renderers/read.ts";
import { registerWrite } from "./tool-renderers/write.ts";
import { resetCodePreviewToolStatuses, setCodePreviewToolStatus } from "./tool-status.ts";
import { ALL_CODE_PREVIEW_TOOLS, type CodePreviewToolName } from "./tool-selection.ts";
import { getEnabledCodePreviewTools } from "./tool-selection.ts";

export interface RegisterToolRenderersOptions {
  registeredTools?: Set<CodePreviewToolName>;
}

export function registerToolRenderers(
  pi: ExtensionAPI,
  cwd: string,
  options: RegisterToolRenderersOptions = {},
) {
  const enabledTools = getEnabledCodePreviewTools();
  resetCodePreviewToolStatuses(enabledTools);
  const existingTools = getExistingToolsByName(pi);

  for (const tool of ALL_CODE_PREVIEW_TOOLS) {
    if (!enabledTools.has(tool)) continue;
    if (options.registeredTools?.has(tool)) {
      setCodePreviewToolStatus(tool, { state: "active" });
      continue;
    }

    const existing = existingTools.get(tool);
    if (existing && existing.sourceInfo.source !== "builtin") {
      setCodePreviewToolStatus(tool, { state: "skipped-conflict", owner: existing.sourceInfo });
      continue;
    }

    registerToolRenderer(tool, pi, cwd);
    options.registeredTools?.add(tool);
    setCodePreviewToolStatus(tool, { state: "active" });
  }
}

function registerToolRenderer(tool: CodePreviewToolName, pi: ExtensionAPI, cwd: string): void {
  if (tool === "bash") registerBash(pi, cwd);
  else if (tool === "read") registerRead(pi, cwd);
  else if (tool === "write") registerWrite(pi, cwd);
  else if (tool === "edit") registerEdit(pi, cwd);
  else if (tool === "grep") registerGrep(pi, cwd);
  else if (tool === "find") registerFind(pi, cwd);
  else if (tool === "ls") registerLs(pi, cwd);
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
