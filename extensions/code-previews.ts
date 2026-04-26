import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { SettingsList } from "@mariozechner/pi-tui";
import { registerToolRenderers } from "../src/renderers.js";
import { createSettingsItems } from "../src/settings-ui.js";
import { SETTINGS_STATE_TYPE, restoreSettings, setCodePreviewSettings, codePreviewSettings, updateSetting, type CodePreviewSettings } from "../src/settings.js";
import { initializeShiki } from "../src/shiki.js";

/**
 * Syntax-highlighted code previews for pi.
 */
export default async function codePreviews(pi: ExtensionAPI) {
	await initializeShiki(codePreviewSettings.shikiTheme);

	function persistSettings() {
		pi.appendEntry<CodePreviewSettings>(SETTINGS_STATE_TYPE, codePreviewSettings);
	}

	pi.on("session_start", async (_event, ctx) => {
		restoreSettings(ctx);
		await initializeShiki(codePreviewSettings.shikiTheme);
	});

	pi.registerCommand("code-preview-settings", {
		description: "Configure code preview settings",
		handler: async (_args, ctx) => {
			const items = createSettingsItems(codePreviewSettings);
			await ctx.ui.custom((_tui, _theme, _kb, done) => {
				const list = new SettingsList(items, items.length + 2, getSettingsListTheme(), (id, value) => {
					const previousTheme = codePreviewSettings.shikiTheme;
					setCodePreviewSettings(updateSetting(codePreviewSettings, id, value));
					if (codePreviewSettings.shikiTheme !== previousTheme) void initializeShiki(codePreviewSettings.shikiTheme);
					persistSettings();
				}, () => done(undefined));
				return list;
			});
		},
	});

	registerToolRenderers(pi, process.cwd());
}
