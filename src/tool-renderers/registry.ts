import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BuiltinToolOptions } from "../tools/builtin-options";
import { ALL_CODE_PREVIEW_TOOLS, type CodePreviewToolName } from "../tools/names";
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

export type ToolRendererDefinition = {
  name: CodePreviewToolName;
  register: ToolRendererRegistration;
};

const TOOL_RENDERER_REGISTRATIONS = {
  bash: (pi, cwd, options) => registerBash(pi, cwd, options.bash),
  read: (pi, cwd, options) => registerRead(pi, cwd, options.read),
  write: (pi, cwd) => registerWrite(pi, cwd),
  edit: (pi, cwd) => registerEdit(pi, cwd),
  grep: (pi, cwd) => registerGrep(pi, cwd),
  find: (pi, cwd) => registerFind(pi, cwd),
  ls: (pi, cwd) => registerLs(pi, cwd),
} satisfies Record<CodePreviewToolName, ToolRendererRegistration>;

export const TOOL_RENDERER_DEFINITIONS = ALL_CODE_PREVIEW_TOOLS.map((name) => ({
  name,
  register: TOOL_RENDERER_REGISTRATIONS[name],
})) satisfies readonly ToolRendererDefinition[];

export const TOOL_RENDERERS_BY_NAME: ReadonlyMap<CodePreviewToolName, ToolRendererDefinition> =
  new Map(TOOL_RENDERER_DEFINITIONS.map((definition) => [definition.name, definition]));
