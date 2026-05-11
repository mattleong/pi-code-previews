import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import {
  cloneCodePreviewSettings,
  codePreviewSettings,
  type CodePreviewSettings,
} from "../settings/index";

export function renderComponent(component: Component, width = 100): string {
  return component.render(width).join("\n");
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TestToolRenderContext {
  args: Record<string, unknown>;
  argsComplete: boolean;
  cwd: string;
  executionStarted: boolean;
  expanded: boolean;
  invalidate: () => void;
  isError: boolean;
  isPartial: boolean;
  lastComponent: Component | undefined;
  showImages: boolean;
  state: Record<string, unknown>;
  toolCallId: string;
}

export function cloneCodePreviewSettingsForTest(): CodePreviewSettings {
  return cloneCodePreviewSettings(codePreviewSettings);
}

export function createToolRenderContext(
  overrides: Partial<TestToolRenderContext> = {},
): TestToolRenderContext {
  return {
    args: {},
    argsComplete: true,
    cwd: "/tmp/project",
    executionStarted: false,
    expanded: true,
    invalidate: () => undefined,
    isError: false,
    isPartial: true,
    lastComponent: undefined,
    showImages: true,
    state: {},
    toolCallId: "tool-1",
    ...overrides,
  };
}

export function testTheme(): Theme {
  return {
    bold: (text: string) => text,
    fg: (_key: string, text: string) => text,
  } as Theme;
}
