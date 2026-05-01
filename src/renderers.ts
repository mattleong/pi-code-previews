import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerBash } from "./tool-renderers/bash.ts";
import { registerEdit } from "./tool-renderers/edit.ts";
import { registerFind } from "./tool-renderers/find.ts";
import { registerGrep } from "./tool-renderers/grep.ts";
import { registerLs } from "./tool-renderers/ls.ts";
import { registerRead } from "./tool-renderers/read.ts";
import { registerWrite } from "./tool-renderers/write.ts";
import { getEnabledCodePreviewTools } from "./tool-selection.ts";

export function registerToolRenderers(pi: ExtensionAPI, cwd: string) {
  const enabledTools = getEnabledCodePreviewTools();
  if (enabledTools.has("bash")) registerBash(pi, cwd);
  if (enabledTools.has("read")) registerRead(pi, cwd);
  if (enabledTools.has("write")) registerWrite(pi, cwd);
  if (enabledTools.has("edit")) registerEdit(pi, cwd);
  if (enabledTools.has("grep")) registerGrep(pi, cwd);
  if (enabledTools.has("find")) registerFind(pi, cwd);
  if (enabledTools.has("ls")) registerLs(pi, cwd);
}
