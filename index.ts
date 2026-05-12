/**
 * Syntax-highlighted code previews for pi.
 *
 * The package root is the public API for package authors. Keep extension internals under `src/`
 * and expose only stable helpers/types from this file.
 */
export { codePreviews as default } from "./src/extension/index";

/** Load persisted code-preview settings into the runtime singleton and return a defensive copy. */
export { loadCodePreviewSettings } from "./src/settings/bootstrap";

/** Decorate a cooperating package-owned tool with pi-code-previews' visual tool shell. */
export { withCodePreviewShell, type CodePreviewShellOptions } from "./src/api/cooperative-tools";

/** Public settings types used by package authors integrating with pi-code-previews. */
export type { CodePreviewSettings, ToolCallBackgroundMode } from "./src/settings";
