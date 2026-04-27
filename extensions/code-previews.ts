import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { SettingsList } from "@mariozechner/pi-tui";
import { registerToolRenderers } from "../src/renderers.js";
import { loadSettingsFromDisk, saveSettingsToDisk } from "../src/settings-store.js";
import { createSettingsItems } from "../src/settings-ui.js";
import { setCodePreviewSettings, codePreviewSettings, updateSetting } from "../src/settings.js";
import { initializeShiki } from "../src/shiki.js";

/**
 * Syntax-highlighted code previews for pi.
 */
export default async function codePreviews(pi: ExtensionAPI) {
	const savedSettings = await loadSettingsFromDisk();
	if (savedSettings) setCodePreviewSettings(savedSettings);
	await initializeShiki(codePreviewSettings.shikiTheme);

	pi.registerCommand("code-preview-settings", {
		description: "Configure code preview settings",
		handler: async (_args, ctx) => {
			const items = createSettingsItems(codePreviewSettings);
			await ctx.ui.custom((_tui, _theme, _kb, done) => {
				const list = new SettingsList(items, items.length + 2, getSettingsListTheme(), (id, value) => {
					const previousTheme = codePreviewSettings.shikiTheme;
					const resetRequested = id === "resetToDefaults" && value === "reset now";
					setCodePreviewSettings(updateSetting(codePreviewSettings, id, value));
					if (codePreviewSettings.shikiTheme !== previousTheme) void initializeShiki(codePreviewSettings.shikiTheme);
					void saveSettingsToDisk(codePreviewSettings)
						.then(() => {
							if (resetRequested) ctx.ui.notify("Code preview settings reset to defaults", "info");
						})
						.catch((error) => {
							ctx.ui.notify(`Failed to save code preview settings: ${error instanceof Error ? error.message : String(error)}`, "warning");
						});
				}, () => done(undefined));
				return list;
			});
		},
	});

	registerToolRenderers(pi, process.cwd());
}
