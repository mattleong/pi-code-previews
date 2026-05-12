import assert from "node:assert/strict";
import { type Component } from "@earendil-works/pi-tui";
import { afterEach, beforeEach } from "vitest";
import { registerToolRenderers } from "./registration";

export type RegisteredRenderer = {
  name: string;
  execute?: (...args: unknown[]) => Promise<unknown>;
  renderCall?: (...args: unknown[]) => Component;
  renderResult?: (...args: unknown[]) => Component;
  renderShell?: "default" | "self";
  prepareArguments?: (args: unknown) => unknown;
  promptSnippet?: string;
  promptGuidelines?: string[];
};

export function preserveCodePreviewToolsEnv(): void {
  let previousCodePreviewTools: string | undefined;

  beforeEach(() => {
    previousCodePreviewTools = process.env.CODE_PREVIEW_TOOLS;
  });

  afterEach(() => {
    if (previousCodePreviewTools === undefined) delete process.env.CODE_PREVIEW_TOOLS;
    else process.env.CODE_PREVIEW_TOOLS = previousCodePreviewTools;
  });
}

export function registerRenderers(cwd = "/tmp/project"): RegisteredRenderer[] {
  const registered: RegisteredRenderer[] = [];
  registerToolRenderers(
    { registerTool: (tool: unknown) => registered.push(tool as RegisteredRenderer) } as never,
    cwd,
  );
  return registered;
}

export function findRenderer<T extends RegisteredRenderer = RegisteredRenderer>(
  registered: RegisteredRenderer[],
  name: string,
): T {
  const tool = registered.find((candidate) => candidate.name === name);
  assert.ok(tool, `Expected ${name} renderer to be registered`);
  return tool as T;
}
