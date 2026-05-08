import assert from "node:assert/strict";
import { test } from "vitest";
import { delay, renderComponent, stripAnsi, testTheme } from "./test-utils.ts";
import {
  findRenderer,
  preserveCodePreviewToolsEnv,
  registerRenderers,
} from "./renderer-test-utils.ts";

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
