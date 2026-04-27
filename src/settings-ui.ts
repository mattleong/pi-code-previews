import { getSelectListTheme } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Spacer, Text, type SelectItem, type SettingItem } from "@mariozechner/pi-tui";
import { bundledThemes } from "shiki";
import type { CodePreviewSettings } from "./settings.js";

export function createSettingsItems(current: CodePreviewSettings): SettingItem[] {
	return [
		{
			id: "shikiTheme",
			label: "Syntax theme",
			description: "Theme used for Shiki syntax highlighting in code previews.",
			currentValue: current.shikiTheme,
			submenu: (currentValue, done) => new ThemeSelectSubmenu(currentValue, done),
		},
		{
			id: "diffIntensity",
			label: "Diff background",
			description: "Background intensity for added and removed edit diff lines.",
			currentValue: current.diffIntensity,
			values: ["off", "subtle", "medium"],
		},
		{
			id: "readCollapsedLines",
			label: "Read preview lines",
			description: "Maximum read result lines shown before collapsing.",
			currentValue: String(current.readCollapsedLines),
			values: ["10", "20", "40", "80"],
		},
		{
			id: "writeCollapsedLines",
			label: "Write preview lines",
			description: "Maximum write content lines shown before collapsing.",
			currentValue: String(current.writeCollapsedLines),
			values: ["10", "20", "40", "80"],
		},
		{
			id: "editCollapsedLines",
			label: "Edit diff preview lines",
			description: "Maximum edit diff lines shown before collapsing. `all` matches pi's built-in edit diff behavior.",
			currentValue: String(current.editCollapsedLines),
			values: ["all", "60", "100", "160", "240"],
		},
		{
			id: "readLineNumbers",
			label: "Read line numbers",
			description: "Show line numbers in read previews.",
			currentValue: current.readLineNumbers ? "on" : "off",
			values: ["on", "off"],
		},
		{
			id: "bashWarnings",
			label: "Bash visual warnings",
			description: "Show preview-only warnings for potentially destructive shell commands.",
			currentValue: current.bashWarnings ? "on" : "off",
			values: ["on", "off"],
		},
		{
			id: "resetToDefaults",
			label: "Reset to defaults",
			description: "Restore the default code preview settings.",
			currentValue: "keep",
			values: ["keep", "reset"],
		},
	];
}

class ThemeSelectSubmenu extends Container {
	private readonly selectList: SelectList;

	constructor(currentTheme: string, done: (selectedValue?: string) => void) {
		super();

		const themes: SelectItem[] = Object.keys(bundledThemes)
			.sort()
			.map((theme) => ({ value: theme, label: theme }));

		this.selectList = new SelectList(themes, 12, getSelectListTheme(), {
			minPrimaryColumnWidth: 16,
			maxPrimaryColumnWidth: 48,
		});

		const currentIndex = themes.findIndex((theme) => theme.value === currentTheme);
		if (currentIndex >= 0) this.selectList.setSelectedIndex(currentIndex);

		this.selectList.onSelect = (item) => done(item.value);
		this.selectList.onCancel = () => done(undefined);

		this.addChild(new Text("Syntax theme", 0, 0));
		this.addChild(new Text("Select a Shiki theme for code previews.", 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(this.selectList);
		this.addChild(new Spacer(1));
		this.addChild(new Text("Enter to select · Esc to go back", 0, 0));
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}
}
