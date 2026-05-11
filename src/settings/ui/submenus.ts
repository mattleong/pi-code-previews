import { getSelectListTheme, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  SelectList,
  SettingsList,
  Spacer,
  Text,
  type SelectItem,
  type SettingItem,
} from "@earendil-works/pi-tui";
import { bundledThemes } from "shiki";
import { SETTINGS_GROUP_ID_PREFIX } from "./registry";
import {
  ALL_CODE_PREVIEW_TOOLS,
  parseCodePreviewTools,
  type CodePreviewToolName,
} from "../../tools/names";
import { formatToolsSettingValue } from "../../tools/policy";
import {
  formatToolOwner,
  getCodePreviewToolStatuses,
  type CodePreviewToolStatus,
} from "../../tools/status";

type SettingChangeHandler = (id: string, value: string) => void;

interface SettingsGroupSubmenuOptions {
  title: string;
  description: string;
  items: () => SettingItem[];
  onChange: SettingChangeHandler;
  done: (selectedValue?: string) => void;
  summary?: () => string;
  maxVisible?: number;
}

export class SettingsGroupSubmenu extends Container {
  private readonly settingsList: SettingsList;

  constructor(private readonly options: SettingsGroupSubmenuOptions) {
    super();

    const items = options.items();
    this.settingsList = new SettingsList(
      items,
      options.maxVisible ?? Math.min(items.length + 2, 12),
      getSettingsListTheme(),
      (id, value) => {
        if (!id.startsWith(SETTINGS_GROUP_ID_PREFIX)) options.onChange(id, value);
        this.syncValues();
      },
      () => options.done(options.summary?.()),
    );

    this.addChild(new Text(options.title, 0, 0));
    this.addChild(new Text(options.description, 0, 0));
    this.addChild(new Spacer(1));
    this.addChild(this.settingsList);
  }

  handleInput(data: string): void {
    this.settingsList.handleInput(data);
  }

  private syncValues(): void {
    for (const item of this.options.items())
      this.settingsList.updateValue(item.id, item.currentValue);
  }
}

export class ToolPreviewSettingsSubmenu extends Container {
  private readonly selectedTools: Set<CodePreviewToolName>;
  private readonly settingsList: SettingsList;

  constructor(currentValue: string, done: (selectedValue?: string) => void) {
    super();
    this.selectedTools = parseCodePreviewTools(currentValue) ?? new Set(ALL_CODE_PREVIEW_TOOLS);
    this.settingsList = new SettingsList(
      createToolToggleItems(this.selectedTools, getCodePreviewToolStatuses()),
      ALL_CODE_PREVIEW_TOOLS.length + 2,
      getSettingsListTheme(),
      (id, value) => {
        const tool = parseToolToggleId(id);
        if (!tool) return;
        if (value === "on") this.selectedTools.add(tool);
        else this.selectedTools.delete(tool);
      },
      () => done(this.formatSelectedTools()),
    );

    this.addChild(new Text("Preview tools", 0, 0));
    this.addChild(
      new Text("Toggle tool previews individually. Changes take effect after /reload.", 0, 0),
    );
    this.addChild(new Spacer(1));
    this.addChild(this.settingsList);
  }

  handleInput(data: string): void {
    this.settingsList.handleInput(data);
  }

  private formatSelectedTools(): string {
    return formatToolsSettingValue(
      ALL_CODE_PREVIEW_TOOLS.filter((tool) => this.selectedTools.has(tool)),
    );
  }
}

function createToolToggleItems(
  enabledTools: Set<CodePreviewToolName>,
  statuses: Map<CodePreviewToolName, CodePreviewToolStatus>,
): SettingItem[] {
  return ALL_CODE_PREVIEW_TOOLS.map((tool) => {
    const status = statuses.get(tool);
    if (status?.state === "skipped-conflict") {
      const owner = formatToolOwner(status.owner);
      return {
        id: `tool:${tool}`,
        label: `${tool} preview`,
        description: `${tool} preview is disabled because ${owner} owns the ${tool} tool. Disable that extension or change package order to let pi-code-previews own it.`,
        currentValue: `disabled (${owner})`,
      };
    }

    const statusText =
      status?.state === "active" ? "currently active" : "takes effect after /reload";
    return {
      id: `tool:${tool}`,
      label: `${tool} preview`,
      description: `${tool} preview registration (${statusText}). Tools already owned by another extension are disabled automatically.`,
      currentValue: enabledTools.has(tool) ? "on" : "off",
      values: ["on", "off"],
    };
  });
}

function parseToolToggleId(id: string): CodePreviewToolName | undefined {
  const tool = id.startsWith("tool:") ? id.slice("tool:".length) : "";
  return ALL_CODE_PREVIEW_TOOLS.find((candidate) => candidate === tool);
}

export class ThemeSelectSubmenu extends Container {
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
