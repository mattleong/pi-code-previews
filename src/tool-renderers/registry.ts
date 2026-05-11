import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BuiltinToolOptions } from "../tools/builtin-options";
import type { CodePreviewToolName } from "../tools/names";
import { registerBash } from "./bash";
import { registerEdit } from "./edit";
import { registerFind } from "./find";
import { registerGrep } from "./grep";
import { registerLs } from "./ls";
import { registerRead } from "./read";
import { registerWrite } from "./write";

export type ToolRendererRegistration = (
  pi: ExtensionAPI,
  cwd: string,
  options: BuiltinToolOptions,
) => void;

export const TOOL_RENDERER_REGISTRATIONS = {
  bash: (pi, cwd, options) => registerBash(pi, cwd, options.bash),
  read: (pi, cwd, options) => registerRead(pi, cwd, options.read),
  write: (pi, cwd) => registerWrite(pi, cwd),
  edit: (pi, cwd) => registerEdit(pi, cwd),
  grep: (pi, cwd) => registerGrep(pi, cwd),
  find: (pi, cwd) => registerFind(pi, cwd),
  ls: (pi, cwd) => registerLs(pi, cwd),
} satisfies Record<CodePreviewToolName, ToolRendererRegistration>;
