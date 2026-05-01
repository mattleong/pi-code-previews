import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerBash } from "./tool-renderers/bash.js";
import { registerEdit } from "./tool-renderers/edit.js";
import { registerFind } from "./tool-renderers/find.js";
import { registerGrep } from "./tool-renderers/grep.js";
import { registerLs } from "./tool-renderers/ls.js";
import { registerRead } from "./tool-renderers/read.js";
import { registerWrite } from "./tool-renderers/write.js";
import { getEnabledCodePreviewTools } from "./tool-selection.js";

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
