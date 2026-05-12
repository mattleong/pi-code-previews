import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTheme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { afterEach, test } from "vitest";
import codePreviews, { loadCodePreviewSettings, withCodePreviewShell } from "./index";
import type { CodePreviewSettings, ToolCallBackgroundMode } from "./index";
import {
  codePreviewSettings,
  defaultCodePreviewSettings,
  setCodePreviewSettings,
} from "./src/settings/index";
import { renderComponent, stripAnsi, testTheme } from "./src/testing/render";

const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalHome = process.env.HOME;
const originalSettings = { ...codePreviewSettings, tools: [...codePreviewSettings.tools] };

test("root public API exposes only stable package-author helpers", () => {
  const mode: ToolCallBackgroundMode = "border";
  const settings: CodePreviewSettings = { ...defaultCodePreviewSettings, toolCallBackground: mode };
  assert.equal(settings.toolCallBackground, "border");
  assert.equal(typeof codePreviews, "function");
  assert.equal(typeof loadCodePreviewSettings, "function");
  assert.equal(typeof withCodePreviewShell, "function");
});

afterEach(() => {
  restoreEnv("PI_CODING_AGENT_DIR", originalPiCodingAgentDir);
  restoreEnv("HOME", originalHome);
  setCodePreviewSettings(originalSettings);
});

test("extension entrypoint registers commands and session renderer wiring", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-code-previews-index-"));
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.HOME = join(root, "home");
  await writeFile(
    join(root, "code-previews.json"),
    JSON.stringify({ ...defaultCodePreviewSettings, syntaxHighlighting: false, tools: ["grep"] }),
    "utf8",
  );

  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
  const handlers = new Map<
    string,
    (event: unknown, ctx: { cwd: string }) => void | Promise<void>
  >();
  const registeredTools: string[] = [];
  let activeTools = ["read", "bash"];
  await codePreviews({
    registerCommand: (
      name: string,
      command: { handler: (args: string, ctx: unknown) => Promise<void> },
    ) => {
      commands.set(name, command);
    },
    on: (
      event: string,
      handler: (event: unknown, ctx: { cwd: string }) => void | Promise<void>,
    ) => {
      handlers.set(event, handler);
    },
    registerTool: (tool: { name: string }) => {
      registeredTools.push(tool.name);
    },
    getActiveTools: () => activeTools,
    setActiveTools: (tools: string[]) => {
      activeTools = tools;
    },
  } as never);

  assert.ok(commands.has("code-preview-health"));
  assert.ok(commands.has("code-preview-settings"));
  await handlers.get("session_start")?.(
    { type: "session_start", reason: "startup" },
    { cwd: root },
  );
  assert.deepEqual(registeredTools, ["grep"]);
  assert.deepEqual(activeTools, ["read", "bash", "grep"]);
});

test("health command renders current settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-code-previews-health-"));
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.HOME = join(root, "home");
  const commands = await loadCommandsOnly();
  setCodePreviewSettings({ ...defaultCodePreviewSettings, syntaxHighlighting: false });
  let rendered = "";
  await commands.get("code-preview-health")?.handler("", {
    ui: {
      custom: async (factory: CustomFactory) => {
        const component = factory(undefined, testTheme(), undefined, () => undefined);
        rendered = stripAnsi(renderComponent(component));
      },
    },
  });

  assert.match(rendered, /Code preview health/);
  assert.match(rendered, /Syntax highlighting: off/);
  assert.match(rendered, /Settings file:/);
});

test("settings command updates, saves, and notifies", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-code-previews-settings-command-"));
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.HOME = join(root, "home");
  await mkdir(root, { recursive: true });
  initTheme();

  const commands = await loadCommandsOnly();
  setCodePreviewSettings({ ...defaultCodePreviewSettings, syntaxHighlighting: false });
  const notifications: string[] = [];
  await commands.get("code-preview-settings")?.handler("", {
    ui: {
      notify: (message: string) => notifications.push(message),
      custom: async (factory: CustomFactory) =>
        new Promise<void>((resolve) => {
          const list = factory(undefined, testTheme(), undefined, () => resolve());
          (list as unknown as SettingsListInternals).onChange("readCollapsedLines", "20");
          (list as unknown as SettingsListInternals).onCancel();
        }),
    },
  });

  const saved = JSON.parse(await readFile(join(root, "code-previews.json"), "utf8"));
  assert.equal(saved.readCollapsedLines, 20);
  assert.equal(notifications.length, 0);

  await commands.get("code-preview-settings")?.handler("", {
    ui: {
      notify: (message: string) => notifications.push(message),
      custom: async (factory: CustomFactory) =>
        new Promise<void>((resolve) => {
          const list = factory(undefined, testTheme(), undefined, () => resolve());
          (list as unknown as SettingsListInternals).onChange("resetToDefaults", "reset now");
          (list as unknown as SettingsListInternals).onCancel();
        }),
    },
  });
  assert.ok(notifications.some((message) => message.includes("reset to defaults")));
});

type CustomFactory = (
  tui: unknown,
  theme: ReturnType<typeof testTheme>,
  keybindings: unknown,
  done: (value?: undefined) => void,
) => Component;

interface SettingsListInternals {
  onChange(id: string, value: string): void;
  onCancel(): void;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function loadCommandsOnly(): Promise<
  Map<string, { handler: (args: string, ctx: { ui: unknown }) => Promise<void> }>
> {
  const commands = new Map<
    string,
    { handler: (args: string, ctx: { ui: unknown }) => Promise<void> }
  >();
  await codePreviews({
    registerCommand: (
      name: string,
      command: { handler: (args: string, ctx: { ui: unknown }) => Promise<void> },
    ) => {
      commands.set(name, command);
    },
    on: () => undefined,
  } as never);
  return commands;
}
