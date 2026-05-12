import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { registerToolRenderers } from "./registration";
import { defaultCodePreviewSettings, setCodePreviewSettings } from "../settings/index";
import type { CodePreviewToolName } from "../tools/names";
import { formatActiveCodePreviewTools, formatSkippedCodePreviewToolLines } from "../tools/status";
import { findRenderer, preserveCodePreviewToolsEnv, registerRenderers } from "./testing";
import { createToolRenderContext, renderComponent, stripAnsi, testTheme } from "../testing/render";

preserveCodePreviewToolsEnv();

test("renderer registration activates enabled preview tool overrides", () => {
  process.env.CODE_PREVIEW_TOOLS = "grep,find,ls";
  const registered: Array<{ name: string }> = [];
  let activeTools = ["read", "bash"];
  registerToolRenderers(
    {
      getActiveTools: () => activeTools,
      setActiveTools: (tools: string[]) => {
        activeTools = tools;
      },
      registerTool: (tool: unknown) => registered.push(tool as { name: string }),
    } as never,
    "/tmp/project",
    { toolOptions: {} },
  );

  assert.deepEqual(
    registered.map((tool) => tool.name),
    ["grep", "find", "ls"],
  );
  assert.deepEqual(activeTools, ["read", "bash", "grep", "find", "ls"]);
  assert.equal(formatActiveCodePreviewTools(), "grep, find, ls");
});

test("renderer registration removes previously activated previews when disabled", () => {
  const registeredTools = new Set<CodePreviewToolName>();
  const activatedTools = new Set<CodePreviewToolName>();
  let activeTools = ["read", "bash"];
  const pi = {
    getActiveTools: () => activeTools,
    setActiveTools: (tools: string[]) => {
      activeTools = tools;
    },
    registerTool: () => undefined,
  };

  process.env.CODE_PREVIEW_TOOLS = "grep";
  registerToolRenderers(pi as never, "/tmp/project", {
    registeredTools,
    activatedTools,
    toolOptions: {},
  });
  assert.deepEqual(activeTools, ["read", "bash", "grep"]);
  assert.deepEqual([...activatedTools], ["grep"]);

  process.env.CODE_PREVIEW_TOOLS = "none";
  registerToolRenderers(pi as never, "/tmp/project", {
    registeredTools,
    activatedTools,
    toolOptions: {},
  });
  assert.deepEqual(activeTools, ["read", "bash"]);
  assert.deepEqual([...activatedTools], []);
});

test("renderer registration does not remove tools that were already active", () => {
  const activatedTools = new Set<CodePreviewToolName>();
  let activeTools = ["read", "bash", "grep"];
  const pi = {
    getActiveTools: () => activeTools,
    setActiveTools: (tools: string[]) => {
      activeTools = tools;
    },
    registerTool: () => undefined,
  };

  process.env.CODE_PREVIEW_TOOLS = "grep";
  registerToolRenderers(pi as never, "/tmp/project", { activatedTools, toolOptions: {} });
  process.env.CODE_PREVIEW_TOOLS = "none";
  registerToolRenderers(pi as never, "/tmp/project", { activatedTools, toolOptions: {} });
  assert.deepEqual(activeTools, ["read", "bash", "grep"]);
  assert.deepEqual([...activatedTools], []);
});

test("renderer registration skips tools already owned by another extension", () => {
  process.env.CODE_PREVIEW_TOOLS = "read,grep,write";
  const registered: Array<{ name: string }> = [];
  registerToolRenderers(
    {
      getAllTools: () => [
        {
          name: "read",
          description: "read via fff",
          parameters: {},
          sourceInfo: {
            source: "npm:pi-fff",
            path: "/tmp/pi-fff/index.ts",
            scope: "user",
            origin: "package",
          },
        },
        {
          name: "grep",
          description: "grep via fff",
          parameters: {},
          sourceInfo: {
            source: "npm:pi-fff",
            path: "/tmp/pi-fff/index.ts",
            scope: "user",
            origin: "package",
          },
        },
        {
          name: "write",
          description: "write",
          parameters: {},
          sourceInfo: {
            source: "builtin",
            path: "<builtin:write>",
            scope: "temporary",
            origin: "top-level",
          },
        },
      ],
      registerTool: (tool: unknown) => registered.push(tool as { name: string }),
    } as never,
    "/tmp/project",
  );

  assert.deepEqual(
    registered.map((tool) => tool.name),
    ["write"],
  );
  assert.equal(formatActiveCodePreviewTools(), "write");
  assert.deepEqual(formatSkippedCodePreviewToolLines(), [
    "  read — owned by npm:pi-fff",
    "  grep — owned by npm:pi-fff",
  ]);
});

test("registered edit renderer preserves built-in metadata and prepareArguments shim", () => {
  process.env.CODE_PREVIEW_TOOLS = "edit";
  const edit = findRenderer(registerRenderers(), "edit");
  assert.equal(edit.name, "edit");
  assert.equal(typeof edit.prepareArguments, "function");
  assert.equal(edit.renderShell, "default");
  assert.equal(typeof edit.promptSnippet, "string");
  assert.ok(edit.promptGuidelines?.length);
  assert.deepEqual(edit.prepareArguments?.({ path: "a.txt", oldText: "a", newText: "b" }), {
    path: "a.txt",
    edits: [{ oldText: "a", newText: "b" }],
  });
});

test("registered renderers can use a self shell when tool backgrounds are disabled", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash,edit";
  setCodePreviewSettings({
    ...defaultCodePreviewSettings,
    toolCallBackground: "off",
  });
  try {
    const registered = registerRenderers();
    assert.equal(findRenderer(registered, "bash").renderShell, "self");
    assert.equal(findRenderer(registered, "edit").renderShell, "self");
  } finally {
    setCodePreviewSettings(defaultCodePreviewSettings);
  }
});

test("border mode puts hidden output expand hints in the bottom-right border and timing in the top-right border", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash";
  setCodePreviewSettings({
    ...defaultCodePreviewSettings,
    toolCallBackground: "border",
    bashResultPreview: false,
    toolCallTiming: true,
  });
  try {
    const bash = findRenderer(registerRenderers(), "bash");
    assert.ok(bash.renderCall);
    assert.ok(bash.renderResult);

    const state = {};
    const theme = testTheme();
    const context = createToolRenderContext({
      args: { command: "echo hidden" },
      executionStarted: true,
      expanded: false,
      state,
    });
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const call = bash.renderCall(context.args, theme, context);
    vi.mocked(Date.now).mockReturnValue(4_000);
    const result = bash.renderResult(
      { content: [{ type: "text", text: "hidden output" }], details: {} },
      { expanded: false, isPartial: false },
      theme,
      { ...context, isPartial: false },
    );

    assert.equal(stripAnsi(renderComponent(result, 72)), "");
    const rendered = stripAnsi(renderComponent(call, 72));
    const rows = rendered.split("\n");
    assert.doesNotMatch(rendered, /│ .*expand/);
    assert.match(rows.at(0) ?? "", /╭─+ Took 3\.0s ╮$/);
    assert.match(rows.at(-1) ?? "", /╰─+ .*expand ╯$/);
    assert.doesNotMatch(rows.at(-1) ?? "", /3\.0s/);
    assert.doesNotMatch(rendered, /output hidden/);
  } finally {
    vi.restoreAllMocks();
    setCodePreviewSettings(defaultCodePreviewSettings);
  }
});

test("border mode wraps tool call and result in a status-colored border-only shell", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash";
  setCodePreviewSettings({
    ...defaultCodePreviewSettings,
    toolCallBackground: "border",
  });
  try {
    const bash = findRenderer(registerRenderers(), "bash");
    assert.equal(bash.renderShell, "self");
    assert.ok(bash.renderCall);
    assert.ok(bash.renderResult);

    const state = {};
    const coloredTheme = {
      ...testTheme(),
      fg: (key: string, text: string) =>
        ["warning", "success", "error", "borderMuted"].includes(key)
          ? `<${key}>${text}</${key}>`
          : text,
    };
    const context = createToolRenderContext({
      args: { command: "echo hi" },
      isPartial: false,
      state,
    });
    const pending = renderComponent(
      bash.renderCall(context.args, coloredTheme, { ...context, isPartial: true }),
      30,
    );
    assert.match(pending, /^<warning>╭─+╮<\/warning>/);

    const call = bash.renderCall(context.args, coloredTheme, context);
    const result = bash.renderResult(
      { content: [{ type: "text", text: "ok" }], details: {} },
      { expanded: true, isPartial: false },
      coloredTheme,
      context,
    );

    assert.equal(stripAnsi(renderComponent(result, 30)), "");
    const rendered = stripAnsi(renderComponent(call, 30));
    assert.match(rendered, /^<success>╭─+╮<\/success>/);
    const plain = rendered.replace(/<\/?[a-zA-Z]+>/g, "");
    assert.match(plain, /^╭─+╮/);
    assert.match(plain, /│ \$ echo hi\s+│/);
    assert.match(plain, /│ ok\s+│/);
    assert.match(plain, /╰─+╯$/);

    bash.renderResult(
      { content: [{ type: "text", text: "failed" }], details: {} },
      { expanded: true, isPartial: false },
      coloredTheme,
      { ...context, isError: true },
    );
    assert.match(renderComponent(call, 30), /^<error>╭─+╮<\/error>/);
  } finally {
    setCodePreviewSettings(defaultCodePreviewSettings);
  }
});
