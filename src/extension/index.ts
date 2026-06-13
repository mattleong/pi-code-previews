import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerHealthCommand } from "../commands/health";
import { registerSettingsCommand } from "../commands/settings";
import { codePreviewSettings } from "../settings/index";
import { loadCodePreviewSettings } from "../settings/bootstrap";
import { initializeShiki } from "../syntax/shiki";
import { type CodePreviewToolName } from "../tools/names";
import { registerToolRenderers } from "../tool-renderers/registration";

export async function codePreviews(pi: ExtensionAPI) {
  await loadCodePreviewSettings();
  const registeredTools = new Set<CodePreviewToolName>();
  const activatedTools = new Set<CodePreviewToolName>();

  registerHealthCommand(pi);
  registerSettingsCommand(pi);

  pi.on("session_start", async (_event, ctx) => {
    try {
      await loadCodePreviewSettings(ctx.cwd);
      if (codePreviewSettings.syntaxHighlighting)
        void initializeShiki(codePreviewSettings.shikiTheme);
    } catch (error) {
      console.warn("[pi-code-previews] Failed to load settings.", error);
    }
    registerToolRenderers(pi, ctx.cwd, { registeredTools, activatedTools });
  });
}
