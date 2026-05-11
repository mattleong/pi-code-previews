import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { codePreviewSettings, setCodePreviewSettings } from "../../settings/index";
import {
  cloneCodePreviewSettingsForTest,
  delay,
  renderComponent,
  stripAnsi,
  testTheme,
} from "../../testing/render";
import { findRenderer, preserveCodePreviewToolsEnv, registerRenderers } from "../testing";

preserveCodePreviewToolsEnv();

test("registered edit call previews proposed edits before execution", () => {
  process.env.CODE_PREVIEW_TOOLS = "edit";
  const edit = findRenderer(registerRenderers(), "edit");
  assert.ok(edit.renderCall);
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

test("registered edit timing measures execution start to result completion", () => {
  process.env.CODE_PREVIEW_TOOLS = "edit";
  const previousSettings = cloneCodePreviewSettingsForTest();
  setCodePreviewSettings({
    ...codePreviewSettings,
    toolCallBackground: "on",
    toolCallTiming: true,
  });
  try {
    const edit = findRenderer(registerRenderers(), "edit");
    assert.ok(edit.renderCall);
    assert.ok(edit.renderResult);

    const args = {
      path: "src/a.ts",
      edits: [{ oldText: "old", newText: "new" }],
    };
    const state = {};
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    edit.renderCall(args, testTheme(), {
      argsComplete: true,
      cwd: "/tmp/project",
      executionStarted: true,
      expanded: true,
      invalidate: () => undefined,
      isError: false,
      isPartial: true,
      lastComponent: undefined,
      showImages: true,
      state,
      toolCallId: "tool-1",
    });

    vi.mocked(Date.now).mockReturnValue(3_120);
    const result = edit.renderResult(
      {
        content: [{ type: "text", text: "ok" }],
        details: { diff: "-old\n+new" },
      },
      { expanded: true, isPartial: false },
      testTheme(),
      {
        args,
        argsComplete: true,
        cwd: "/tmp/project",
        executionStarted: true,
        expanded: true,
        invalidate: () => undefined,
        isError: false,
        isPartial: false,
        lastComponent: undefined,
        showImages: true,
        state,
        toolCallId: "tool-1",
      },
    );

    assert.match(stripAnsi(renderComponent(result)), /╰─ Took 2\.1s/);
  } finally {
    vi.restoreAllMocks();
    setCodePreviewSettings(previousSettings);
  }
});

test("registered write renderer hides code previews until expanded", () => {
  process.env.CODE_PREVIEW_TOOLS = "write";
  const previousSettings = cloneCodePreviewSettingsForTest();
  setCodePreviewSettings({ ...codePreviewSettings, writeContentPreview: false });
  try {
    const write = findRenderer(registerRenderers(), "write");
    assert.ok(write.renderCall);
    assert.ok(write.renderResult);

    const args = { path: "src/a.ts", content: "const after = 2;\n" };
    const collapsedCall = stripAnsi(
      renderComponent(
        write.renderCall(args, testTheme(), {
          argsComplete: true,
          cwd: "/tmp/project",
          executionStarted: false,
          expanded: false,
          invalidate: () => undefined,
          isError: false,
          isPartial: true,
          lastComponent: undefined,
          showImages: true,
          state: {},
          toolCallId: "tool-1",
        }),
      ),
    );
    assert.match(collapsedCall, /write src\/a\.ts/);
    assert.match(collapsedCall, /expand/);
    assert.doesNotMatch(collapsedCall, /output hidden/);
    assert.doesNotMatch(collapsedCall, /const after = 2/);

    const expandedCall = stripAnsi(
      renderComponent(
        write.renderCall(args, testTheme(), {
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
        }),
      ),
    );
    assert.match(expandedCall, /const after = 2/);

    const collapsedResult = stripAnsi(
      renderComponent(
        write.renderResult(
          {
            content: [{ type: "text", text: "ok" }],
            details: {
              codePreviewBeforeWrite: { kind: "content", content: "const before = 1;\n" },
            },
          },
          { expanded: false, isPartial: false },
          testTheme(),
          {
            args,
            isError: false,
            invalidate: () => undefined,
            state: {},
          },
        ),
      ),
    );
    assert.match(collapsedResult, /✓ Write applied/);
    assert.match(collapsedResult, /expand/);
    assert.doesNotMatch(collapsedResult, /output hidden/);
    assert.doesNotMatch(collapsedResult, /const after = 2/);

    const newFileCollapsedResult = stripAnsi(
      renderComponent(
        write.renderResult(
          {
            content: [{ type: "text", text: "ok" }],
            details: { codePreviewBeforeWrite: { kind: "missing" } },
          },
          { expanded: false, isPartial: false },
          testTheme(),
          {
            args,
            isError: false,
            invalidate: () => undefined,
            state: {},
          },
        ),
      ),
    );
    assert.match(newFileCollapsedResult, /✓ New file/);
    assert.doesNotMatch(newFileCollapsedResult, /output hidden/);

    const expandedResult = stripAnsi(
      renderComponent(
        write.renderResult(
          {
            content: [{ type: "text", text: "ok" }],
            details: {
              codePreviewBeforeWrite: { kind: "content", content: "const before = 1;\n" },
            },
          },
          { expanded: true, isPartial: false },
          testTheme(),
          {
            args,
            isError: false,
            invalidate: () => undefined,
            state: {},
          },
        ),
      ),
    );
    assert.match(expandedResult, /const after = 2/);
  } finally {
    setCodePreviewSettings(previousSettings);
  }
});

test("registered write renderer distinguishes blank-only content from empty content", () => {
  process.env.CODE_PREVIEW_TOOLS = "write";
  const write = findRenderer(registerRenderers(), "write");
  assert.ok(write.renderCall);

  const rendered = stripAnsi(
    renderComponent(
      write.renderCall({ path: "blank.txt", content: "\n\n" }, testTheme(), {
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
      }),
    ),
  );

  assert.doesNotMatch(rendered, /Empty content/);
  assert.match(rendered, /1 line/);
});

test("registered edit renderer hides diff previews until expanded", () => {
  process.env.CODE_PREVIEW_TOOLS = "edit";
  const previousSettings = cloneCodePreviewSettingsForTest();
  setCodePreviewSettings({ ...codePreviewSettings, editDiffPreview: false });
  try {
    const edit = findRenderer(registerRenderers(), "edit");
    assert.ok(edit.renderCall);
    assert.ok(edit.renderResult);

    const args = {
      path: "src/a.ts",
      edits: [{ oldText: "const value = 1;", newText: "const value = 2;" }],
    };
    const collapsedCall = stripAnsi(
      renderComponent(
        edit.renderCall(args, testTheme(), {
          argsComplete: true,
          expanded: false,
          executionStarted: false,
          lastComponent: undefined,
          state: {},
          invalidate: () => undefined,
        }),
      ),
    );
    assert.match(collapsedCall, /edit src\/a\.ts/);
    assert.match(collapsedCall, /expand/);
    assert.doesNotMatch(collapsedCall, /const value = 2/);

    const expandedCall = stripAnsi(
      renderComponent(
        edit.renderCall(args, testTheme(), {
          argsComplete: true,
          expanded: true,
          executionStarted: false,
          lastComponent: undefined,
          state: {},
          invalidate: () => undefined,
        }),
      ),
    );
    assert.match(expandedCall, /proposed edit/);
    assert.match(expandedCall, /const value = 2/);

    const result = {
      content: [{ type: "text", text: "ok" }],
      details: { diff: "-const value = 1;\n+const value = 2;" },
    };
    const collapsedResult = stripAnsi(
      renderComponent(
        edit.renderResult(result, { expanded: false, isPartial: false }, testTheme(), {
          args: { path: "src/a.ts" },
          isError: false,
          invalidate: () => undefined,
          state: {},
        }),
      ),
    );
    assert.match(collapsedResult, /expand/);
    assert.doesNotMatch(collapsedResult, /const value = 2/);

    const expandedResult = stripAnsi(
      renderComponent(
        edit.renderResult(result, { expanded: true, isPartial: false }, testTheme(), {
          args: { path: "src/a.ts" },
          isError: false,
          invalidate: () => undefined,
          state: {},
        }),
      ),
    );
    assert.match(expandedResult, /const value = 2/);
  } finally {
    setCodePreviewSettings(previousSettings);
  }
});

test("registered write call reuses cached previews", () => {
  process.env.CODE_PREVIEW_TOOLS = "write";
  const write = findRenderer(registerRenderers(), "write");
  assert.ok(write.renderCall);
  const args = { path: "src/a.ts", content: "const value = 1;\n" };
  const state = {};
  const theme = testTheme();
  const first = write.renderCall(args, theme, {
    argsComplete: true,
    cwd: "/tmp/project",
    executionStarted: false,
    expanded: false,
    invalidate: () => undefined,
    isError: false,
    isPartial: true,
    lastComponent: undefined,
    showImages: true,
    state,
    toolCallId: "tool-1",
  });
  const second = write.renderCall(args, theme, {
    argsComplete: true,
    cwd: "/tmp/project",
    executionStarted: false,
    expanded: false,
    invalidate: () => undefined,
    isError: false,
    isPartial: true,
    lastComponent: first,
    showImages: true,
    state,
    toolCallId: "tool-1",
  });

  assert.equal(second, first);
});

test("registered edit result header omits insertion and deletion shape counts", () => {
  process.env.CODE_PREVIEW_TOOLS = "edit";
  const edit = findRenderer(registerRenderers(), "edit");
  assert.ok(edit.renderCall);
  assert.ok(edit.renderResult);

  const state = {};
  const header = edit.renderCall({ path: "src/a.ts" }, testTheme(), {
    argsComplete: true,
    expanded: true,
    executionStarted: true,
    lastComponent: undefined,
    state,
    invalidate: () => undefined,
  });

  edit.renderResult(
    {
      content: [{ type: "text", text: "ok" }],
      details: { diff: "-old\n+new\n+added\n context\n-removed" },
    },
    { expanded: true, isPartial: false },
    testTheme(),
    {
      args: { path: "src/a.ts" },
      isError: false,
      invalidate: () => undefined,
      state,
    },
  );

  const rendered = stripAnsi(renderComponent(header));
  assert.match(rendered, /edit src\/a\.ts · 2 hunks · \+2 -2/);
  assert.doesNotMatch(rendered, /\binsertions?\b/);
  assert.doesNotMatch(rendered, /\bdeletions?\b/);
});

test("registered result renderers reuse async previews after they settle", async () => {
  process.env.CODE_PREVIEW_TOOLS = "write,edit";
  const registered = registerRenderers();
  const edit = findRenderer(registered, "edit");
  const write = findRenderer(registered, "write");
  assert.ok(edit.renderResult);
  assert.ok(write.renderResult);

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
