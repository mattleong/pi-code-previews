import assert from "node:assert/strict";
import { type Component } from "@mariozechner/pi-tui";
import { afterEach, beforeEach, test } from "vitest";
import { registerToolRenderers } from "../src/renderers.ts";
import {
  codePreviewSettings,
  defaultCodePreviewSettings,
  setCodePreviewSettings,
} from "../src/settings.ts";
import {
  formatActiveCodePreviewTools,
  formatSkippedCodePreviewToolLines,
} from "../src/tool-status.ts";
import { delay, renderComponent, stripAnsi, testTheme } from "./test-utils.ts";

let previousCodePreviewTools: string | undefined;

beforeEach(() => {
  previousCodePreviewTools = process.env.CODE_PREVIEW_TOOLS;
});

afterEach(() => {
  if (previousCodePreviewTools === undefined) delete process.env.CODE_PREVIEW_TOOLS;
  else process.env.CODE_PREVIEW_TOOLS = previousCodePreviewTools;
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

test("registered grep renderer highlights literal matches only", () => {
  process.env.CODE_PREVIEW_TOOLS = "grep";
  const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
  registerToolRenderers(
    {
      registerTool: (tool: unknown) =>
        registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }),
    } as never,
    "/tmp/project",
  );
  const grep = registered.find((tool) => tool.name === "grep");
  assert.ok(grep?.renderResult);
  const literalRendered = renderComponent(
    grep.renderResult(
      { content: [{ type: "text", text: "src/a:1: foo foo foo" }] },
      { expanded: true, isPartial: false },
      testTheme(),
      {
        args: { pattern: "foo", literal: true },
        isError: false,
        invalidate: () => undefined,
        state: {},
      },
    ),
  );
  assert.equal((literalRendered.match(/\x1b\[48;2;90;74;28m/g) ?? []).length, 3);

  const regexRendered = renderComponent(
    grep.renderResult(
      { content: [{ type: "text", text: "src/a:1: foo foo foo" }] },
      { expanded: true, isPartial: false },
      testTheme(),
      {
        args: { pattern: "foo", literal: false },
        isError: false,
        invalidate: () => undefined,
        state: {},
      },
    ),
  );
  assert.equal((regexRendered.match(/\x1b\[48;2;90;74;28m/g) ?? []).length, 0);
});

test("registered edit call previews proposed edits before execution", () => {
  process.env.CODE_PREVIEW_TOOLS = "edit";
  const registered: Array<{ name: string; renderCall?: (...args: unknown[]) => Component }> = [];
  registerToolRenderers(
    {
      registerTool: (tool: unknown) =>
        registered.push(tool as { name: string; renderCall?: (...args: unknown[]) => Component }),
    } as never,
    "/tmp/project",
  );
  const edit = registered.find((tool) => tool.name === "edit");
  assert.ok(edit?.renderCall);
  const args = {
    path: "src/a.ts",
    edits: [{ oldText: "const value = 1;", newText: "const value = 2;" }],
  };
  const state = {};
  const pendingComponent = edit.renderCall(args, testTheme(), {
    argsComplete: true,
    expanded: true,
    executionStarted: false,
    lastComponent: undefined,
    state,
    invalidate: () => undefined,
  });
  const rendered = stripAnsi(renderComponent(pendingComponent));
  assert.match(rendered, /edit src\/a\.ts/);
  assert.match(rendered, /proposed edit/);
  assert.match(rendered, /const value = 1;/);
  assert.match(rendered, /const value = 2;/);

  const started = stripAnsi(
    renderComponent(
      edit.renderCall(args, testTheme(), {
        argsComplete: true,
        expanded: true,
        executionStarted: true,
        lastComponent: pendingComponent,
        state,
        invalidate: () => undefined,
      }),
    ),
  );
  assert.match(started, /edit src\/a\.ts/);
  assert.doesNotMatch(started, /proposed edit/);
});

test("registered result renderers reuse async previews after they settle", async () => {
  process.env.CODE_PREVIEW_TOOLS = "write,edit";
  const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
  registerToolRenderers(
    {
      registerTool: (tool: unknown) =>
        registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }),
    } as never,
    "/tmp/project",
  );
  const edit = registered.find((tool) => tool.name === "edit");
  const write = registered.find((tool) => tool.name === "write");
  assert.ok(edit?.renderResult);
  assert.ok(write?.renderResult);

  const before = "a".repeat(21000);
  const after = "b".repeat(21000);
  const editState = {};
  let editInvalidations = 0;
  const editArgs = [
    { content: [{ type: "text", text: "ok" }], details: { diff: `-1 ${before}\n+1 ${after}` } },
    { expanded: true, isPartial: false },
    testTheme(),
    {
      args: { path: "src/a.ts" },
      isError: false,
      invalidate: () => editInvalidations++,
      state: editState,
    },
  ] as const;
  const firstEditPreview = edit.renderResult(...editArgs);
  assert.match(stripAnsi(renderComponent(firstEditPreview)), /Rendering edit diff/);
  await delay(10);
  const settledEditPreview = edit.renderResult(...editArgs);
  assert.equal(settledEditPreview, firstEditPreview);
  assert.ok(editInvalidations > 0);
  assert.doesNotMatch(stripAnsi(renderComponent(settledEditPreview, 80)), /Rendering edit diff/);

  const writeState = {};
  let writeInvalidations = 0;
  const writeArgs = [
    {
      content: [{ type: "text", text: "ok" }],
      details: { codePreviewBeforeWrite: { kind: "content", content: before } },
    },
    { expanded: true, isPartial: false },
    testTheme(),
    {
      args: { path: "src/a.ts", content: after },
      isError: false,
      invalidate: () => writeInvalidations++,
      state: writeState,
    },
  ] as const;
  const firstWritePreview = write.renderResult(...writeArgs);
  assert.match(stripAnsi(renderComponent(firstWritePreview)), /Rendering write diff/);
  await delay(10);
  const settledWritePreview = write.renderResult(...writeArgs);
  assert.equal(settledWritePreview, firstWritePreview);
  assert.ok(writeInvalidations > 0);
  assert.doesNotMatch(stripAnsi(renderComponent(settledWritePreview, 80)), /Rendering write diff/);
});

test("registered read renderer can hide successful text content while preserving calls", () => {
  process.env.CODE_PREVIEW_TOOLS = "read";
  const previousSettings = { ...codePreviewSettings, tools: [...codePreviewSettings.tools] };
  setCodePreviewSettings({ ...defaultCodePreviewSettings, readContentPreview: false });
  try {
    const registered: Array<{
      name: string;
      renderCall?: (...args: unknown[]) => Component;
      renderResult?: (...args: unknown[]) => Component;
    }> = [];
    registerToolRenderers(
      {
        registerTool: (tool: unknown) =>
          registered.push(
            tool as {
              name: string;
              renderCall?: (...args: unknown[]) => Component;
              renderResult?: (...args: unknown[]) => Component;
            },
          ),
      } as never,
      "/tmp/project",
    );
    const read = registered.find((tool) => tool.name === "read");
    assert.ok(read?.renderCall);
    assert.ok(read.renderResult);

    const call = stripAnsi(
      renderComponent(read.renderCall({ path: "src/a.ts" }, testTheme(), {} as never)),
    );
    assert.match(call, /read src\/a\.ts/);

    const result = stripAnsi(
      renderComponent(
        read.renderResult(
          { content: [{ type: "text", text: "const secret = 1;" }] },
          { expanded: true, isPartial: false },
          testTheme(),
          { args: { path: "src/a.ts" }, isError: false, invalidate: () => undefined, state: {} },
        ),
      ),
    );
    assert.equal(result, "");
  } finally {
    setCodePreviewSettings(previousSettings);
  }
});

test("registered read renderer leaves image rendering to pi", () => {
  process.env.CODE_PREVIEW_TOOLS = "read";
  const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
  registerToolRenderers(
    {
      registerTool: (tool: unknown) =>
        registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }),
    } as never,
    "/tmp/project",
  );
  const read = registered.find((tool) => tool.name === "read");
  assert.ok(read?.renderResult);
  const rendered = renderComponent(
    read.renderResult(
      {
        content: [
          { type: "text", text: "Read image file [image/png]" },
          { type: "image", data: Buffer.from("png").toString("base64"), mimeType: "image/png" },
        ],
      },
      { expanded: true, isPartial: false },
      testTheme(),
      { args: { path: "asset.png" }, isError: false, invalidate: () => undefined, state: {} },
    ),
  );
  assert.equal(stripAnsi(rendered).trimEnd(), "image [image/png]");
  assert.doesNotMatch(rendered, /\x1b\]1337;File=|\x1b_G/);
});

test("registered renderers escape terminal control characters in raw output", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash,grep";
  const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
  registerToolRenderers(
    {
      registerTool: (tool: unknown) =>
        registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }),
    } as never,
    "/tmp/project",
  );
  const bash = registered.find((tool) => tool.name === "bash");
  const grep = registered.find((tool) => tool.name === "grep");
  assert.ok(bash?.renderResult);
  assert.ok(grep?.renderResult);

  const bashRendered = renderComponent(
    bash.renderResult(
      { content: [{ type: "text", text: "ok \x1b[31mred\x00" }] },
      { expanded: true, isPartial: false },
      testTheme(),
      { args: {}, isError: false, invalidate: () => undefined, state: {} },
    ),
  );
  assert.doesNotMatch(bashRendered, /\x1b\[31m/);
  assert.match(bashRendered, /␛\[31mred�/);

  const grepRendered = renderComponent(
    grep.renderResult(
      { content: [{ type: "text", text: "unparsed \x1b[31mred\x00" }] },
      { expanded: true, isPartial: false },
      testTheme(),
      { args: { pattern: "red" }, isError: false, invalidate: () => undefined, state: {} },
    ),
  );
  assert.doesNotMatch(grepRendered, /\x1b\[31m/);
  assert.match(grepRendered, /␛\[31mred�/);
});

test("registered read and grep renderers do not classify successful Error-prefixed content as failures", () => {
  process.env.CODE_PREVIEW_TOOLS = "read,grep";
  const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
  registerToolRenderers(
    {
      registerTool: (tool: unknown) =>
        registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }),
    } as never,
    "/tmp/project",
  );
  const read = registered.find((tool) => tool.name === "read");
  const grep = registered.find((tool) => tool.name === "grep");
  assert.ok(read?.renderResult);
  assert.ok(grep?.renderResult);

  const readRendered = stripAnsi(
    renderComponent(
      read.renderResult(
        { content: [{ type: "text", text: "ErrorBoundary\nok" }] },
        { expanded: true, isPartial: false },
        testTheme(),
        {
          args: { path: "src/ErrorBoundary.tsx" },
          isError: false,
          invalidate: () => undefined,
          state: {},
        },
      ),
    ),
  );
  assert.match(readRendered, /ErrorBoundary/);
  assert.match(readRendered, /ok/);

  const grepRendered = stripAnsi(
    renderComponent(
      grep.renderResult(
        { content: [{ type: "text", text: "ErrorLog.ts:1: Error found" }] },
        { expanded: true, isPartial: false },
        testTheme(),
        { args: { pattern: "Error" }, isError: false, invalidate: () => undefined, state: {} },
      ),
    ),
  );
  assert.match(grepRendered, /ErrorLog\.ts\s*\n/);
  assert.match(grepRendered, /\s1 │ Error found/);
});

test("registered find and ls renderers keep error results out of path-list formatting", () => {
  process.env.CODE_PREVIEW_TOOLS = "find,ls";
  const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
  registerToolRenderers(
    {
      registerTool: (tool: unknown) =>
        registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }),
    } as never,
    "/tmp/project",
  );
  for (const name of ["find", "ls"]) {
    const tool = registered.find((candidate) => candidate.name === name);
    assert.ok(tool?.renderResult);
    const rendered = stripAnsi(
      renderComponent(
        tool.renderResult(
          { content: [{ type: "text", text: "Path not found: /tmp/nope" }] },
          { expanded: true, isPartial: false },
          testTheme(),
          { args: {}, isError: true, invalidate: () => undefined, state: {} },
        ),
      ),
    );
    assert.equal(rendered.trimEnd(), "Path not found: /tmp/nope");
    assert.doesNotMatch(rendered, /[▸•]/);
  }
});

test("registered bash and grep renderers preserve whitespace-sensitive output", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash,grep";
  const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
  registerToolRenderers(
    {
      registerTool: (tool: unknown) =>
        registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }),
    } as never,
    "/tmp/project",
  );
  const bash = registered.find((tool) => tool.name === "bash");
  const grep = registered.find((tool) => tool.name === "grep");
  assert.ok(bash?.renderResult);
  assert.ok(grep?.renderResult);

  const bashOutput = renderComponent(
    bash.renderResult(
      { content: [{ type: "text", text: "  indented\n" }] },
      { expanded: true, isPartial: false },
      testTheme(),
      { args: {}, isError: false, invalidate: () => undefined, state: {} },
    ),
    "  indented".length,
  );
  assert.equal(stripAnsi(bashOutput), "  indented");

  const blankBashOutput = stripAnsi(
    renderComponent(
      bash.renderResult(
        { content: [{ type: "text", text: "   \n" }] },
        { expanded: true, isPartial: false },
        testTheme(),
        { args: {}, isError: false, invalidate: () => undefined, state: {} },
      ),
    ),
  );
  assert.doesNotMatch(blankBashOutput, /No output/);

  const grepOutput = stripAnsi(
    renderComponent(
      grep.renderResult(
        { content: [{ type: "text", text: "src/blank.ts:3: \n" }] },
        { expanded: true, isPartial: false },
        testTheme(),
        { args: { pattern: "^$" }, isError: false, invalidate: () => undefined, state: {} },
      ),
    ),
  );
  assert.match(grepOutput, /src\/blank\.ts/);
  assert.match(grepOutput, /\s3 │ /);
});

test("registered edit renderer preserves built-in metadata and prepareArguments shim", () => {
  process.env.CODE_PREVIEW_TOOLS = "edit";
  const registered: unknown[] = [];
  registerToolRenderers(
    { registerTool: (tool: unknown) => registered.push(tool) } as never,
    "/tmp/project",
  );
  const edit = registered[0] as {
    name: string;
    prepareArguments?: (args: unknown) => unknown;
    promptSnippet?: string;
    promptGuidelines?: string[];
  };
  assert.equal(edit.name, "edit");
  assert.equal(typeof edit.prepareArguments, "function");
  assert.equal(typeof edit.promptSnippet, "string");
  assert.ok(edit.promptGuidelines?.length);
  assert.deepEqual(edit.prepareArguments?.({ path: "a.txt", oldText: "a", newText: "b" }), {
    path: "a.txt",
    edits: [{ oldText: "a", newText: "b" }],
  });
});
