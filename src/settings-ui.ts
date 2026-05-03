import { getSelectListTheme, getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import {
  Container,
  SelectList,
  SettingsList,
  Spacer,
  Text,
  type SelectItem,
  type SettingItem,
} from "@mariozechner/pi-tui";
import { bundledThemes } from "shiki";
import { getSettingsPath } from "./settings-store.ts";
import type { CodePreviewSettings } from "./settings.ts";
import {
  ALL_CODE_PREVIEW_TOOLS,
  parseCodePreviewTools,
  type CodePreviewToolName,
} from "./tool-names.ts";
import {
  formatToolOwner,
  getCodePreviewToolStatuses,
  type CodePreviewToolStatus,
} from "./tool-status.ts";

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
      id: "wordEmphasis",
      label: "Word-level diff emphasis",
      description:
        "Highlight changed words inside edit diffs. Smart mode suppresses low-signal punctuation and wrapper syntax.",
      currentValue: current.wordEmphasis,
      values: ["smart", "all", "off"],
    },
    {
      id: "tools",
      label: "Preview tools",
      description:
        "Open granular tool preview toggles. Changes take effect after /reload. Tools already owned by another extension are skipped automatically.",
      currentValue: current.tools.join(", "),
      submenu: (currentValue, done) => new ToolPreviewSettingsSubmenu(currentValue, done),
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
      description:
        "Maximum edit diff lines shown before collapsing. `all` matches pi's built-in edit diff behavior.",
      currentValue: String(current.editCollapsedLines),
      values: ["all", "60", "100", "160", "240"],
    },
    {
      id: "grepCollapsedLines",
      label: "Grep preview lines",
      description: "Maximum grep result lines shown before collapsing.",
      currentValue: String(current.grepCollapsedLines),
      values: ["10", "15", "25", "40", "80"],
    },
    {
      id: "pathListCollapsedLines",
      label: "Find/ls preview lines",
      description: "Maximum find and ls result lines shown before collapsing.",
      currentValue: String(current.pathListCollapsedLines),
      values: ["10", "20", "40", "80", "120"],
    },
    {
      id: "readLineNumbers",
      label: "Read line numbers",
      description: "Show line numbers in read previews.",
      currentValue: current.readLineNumbers ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "pathIcons",
      label: "Find/ls path icons",
      description:
        "Choose icons for find and ls path-list previews. Nerd mode requires a Nerd Font.",
      currentValue: current.pathIcons,
      values: ["unicode", "nerd", "off"],
    },
    {
      id: "bashWarnings",
      label: "Bash visual warnings",
      description: "Show preview-only warnings for potentially destructive shell commands.",
      currentValue: current.bashWarnings ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "syntaxHighlighting",
      label: "Syntax highlighting",
      description:
        "Use Shiki token colors in code previews. Turn off for plainer, lower-noise previews.",
      currentValue: current.syntaxHighlighting ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "secretWarnings",
      label: "Secret value warnings",
      description:
        "Show preview-only warnings when read, write, or bash output looks like it may contain secrets.",
      currentValue: current.secretWarnings ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "settingsFile",
      label: "Settings file",
      description: "Settings are stored globally in this file.",
      currentValue: getSettingsPath(),
    },
    {
      id: "resetToDefaults",
      label: "Restore defaults",
      description: "Restore the default code preview settings.",
      currentValue: "keep current",
      values: ["keep current", "reset now"],
    },
  ];
}

class ToolPreviewSettingsSubmenu extends Container {
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
    return ALL_CODE_PREVIEW_TOOLS.filter((tool) => this.selectedTools.has(tool)).join(",");
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
