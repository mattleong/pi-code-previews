import assert from "node:assert/strict";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { test, vi } from "vitest";
import { withCodePreviewShell } from "../../index";
import { createToolRenderContext, renderComponent, stripAnsi, testTheme } from "../testing/render";

test("withCodePreviewShell preserves execution and wraps existing renderers", async () => {
  const execute = vi.fn(async () => ({
    content: [{ type: "text" as const, text: "ok" }],
    details: {},
  }));
  const tool: ToolDefinition = {
    name: "demo_tool",
    label: "Demo Tool",
    description: "Demo tool",
    parameters: {} as never,
    execute,
    renderCall(args, _theme, _context) {
      return textComponent(`call ${(args as { value?: string }).value ?? ""}`);
    },
    renderResult(result, _options, _theme, _context) {
      return textComponent(`result ${result.content[0]?.type ?? "none"}`);
    },
  };

  const wrapped = withCodePreviewShell(tool, { mode: "border" });
  assert.equal(wrapped.execute, execute);
  assert.equal(wrapped.parameters, tool.parameters);
  assert.equal(wrapped.renderShell, "self");

  await wrapped.execute("tool-1", {}, undefined, undefined, {} as never);
  assert.equal(execute.mock.calls.length, 1);

  const state = {};
  const context = createToolRenderContext({ state });
  const theme = testTheme();
  const call = wrapped.renderCall?.({ value: "hello" }, theme, context);
  assert.ok(call);
  const result = wrapped.renderResult?.(
    { content: [{ type: "text", text: "ok" }], details: {} },
    { expanded: true, isPartial: false },
    theme,
    { ...context, isPartial: false },
  );

  assert.ok(result);
  assert.equal(stripAnsi(renderComponent(result)), "");
  const renderedCall = stripAnsi(renderComponent(call, 40));
  assert.match(renderedCall, /call hello/);
  assert.match(renderedCall, /result text/);
});

test("withCodePreviewShell supplies fallback renderers for cooperating tools", () => {
  const tool: ToolDefinition = {
    name: "demo_tool",
    label: "Demo Tool",
    description: "Demo tool",
    parameters: {} as never,
    async execute() {
      return { content: [{ type: "text", text: "done" }], details: {} };
    },
  };

  const wrapped = withCodePreviewShell(tool, { mode: "off" });
  assert.equal(wrapped.renderShell, "self");

  const context = createToolRenderContext();
  const call = wrapped.renderCall?.({}, testTheme(), context);
  const result = wrapped.renderResult?.(
    { content: [{ type: "text", text: "done" }], details: {} },
    { expanded: false, isPartial: false },
    testTheme(),
    { ...context, isPartial: false },
  );

  assert.ok(call);
  assert.ok(result);
  assert.equal(stripAnsi(renderComponent(call)).trimEnd(), "Demo Tool");
  assert.equal(stripAnsi(renderComponent(result)).trimEnd(), "done");
});

test("withCodePreviewShell leaves self-shell tools untouched by default", () => {
  const tool: ToolDefinition = {
    name: "self_tool",
    label: "Self Tool",
    description: "Self-shell tool",
    parameters: {} as never,
    renderShell: "self",
    async execute() {
      return { content: [], details: {} };
    },
    renderCall() {
      return textComponent("custom shell");
    },
  };

  assert.equal(withCodePreviewShell(tool, { mode: "border" }), tool);
  assert.notEqual(withCodePreviewShell(tool, { mode: "border", preserveSelfShell: false }), tool);
});

function textComponent(text: string): Component {
  return {
    render: () => [text],
    invalidate: () => undefined,
  };
}
