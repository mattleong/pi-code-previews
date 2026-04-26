import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { SettingsList } from "@mariozechner/pi-tui";
import { registerToolRenderers } from "../src/renderers.js";
import { createSettingsItems } from "../src/settings-ui.js";
import { SETTINGS_STATE_TYPE, restoreSettings, setToolPreviewSettings, toolPreviewSettings, updateSetting, type ToolPreviewSettings } from "../src/settings.js";
import { initializeShiki } from "../src/shiki.js";

/**
 * Syntax-highlighted tool previews for pi.
 */
export default async function toolPreviews(pi: ExtensionAPI) {
	await initializeShiki(toolPreviewSettings.shikiTheme);

	function persistSettings() {
		pi.appendEntry<ToolPreviewSettings>(SETTINGS_STATE_TYPE, toolPreviewSettings);
	}

	pi.on("session_start", async (_event, ctx) => {
		restoreSettings(ctx);
		await initializeShiki(toolPreviewSettings.shikiTheme);
	});

	pi.registerCommand("tool-preview-settings", {
		description: "Configure tool preview settings",
		handler: async (_args, ctx) => {
			const items = createSettingsItems(toolPreviewSettings);
			await ctx.ui.custom((_tui, _theme, _kb, done) => {
				const list = new SettingsList(items, items.length + 2, getSettingsListTheme(), (id, value) => {
					const previousTheme = toolPreviewSettings.shikiTheme;
					setToolPreviewSettings(updateSetting(toolPreviewSettings, id, value));
					if (toolPreviewSettings.shikiTheme !== previousTheme) void initializeShiki(toolPreviewSettings.shikiTheme);
					persistSettings();
				}, () => done(undefined));
				return list;
			});
		},
	});

	registerToolRenderers(pi, process.cwd());
}
