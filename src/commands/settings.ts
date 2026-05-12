import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodePreviewSettingsList } from "./panels/settings";

export function registerSettingsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("code-preview-settings", {
    description: "Configure code preview settings",
    handler: async (_args, ctx) => {
      await ctx.ui.custom((_tui, _theme, _kb, done) =>
        createCodePreviewSettingsList({
          notify: (message, level) => ctx.ui.notify(message, level),
          done: () => done(undefined),
        }),
      );
    },
  });
}
