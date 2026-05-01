import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";

export function renderComponent(component: Component, width = 100): string {
  return component.render(width).join("\n");
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function testTheme(): Theme {
  return {
    bold: (text: string) => text,
    fg: (_key: string, text: string) => text,
  } as Theme;
}
