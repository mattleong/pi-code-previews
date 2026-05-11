import assert from "node:assert/strict";
import { test } from "vitest";
import { defaultCodePreviewSettings, setCodePreviewSettings } from "../settings/index";
import {
  cloneCodePreviewSettingsForTest,
  renderComponent,
  stripAnsi,
  testTheme,
} from "../testing/render";
import { findRenderer, preserveCodePreviewToolsEnv, registerRenderers } from "./testing";

preserveCodePreviewToolsEnv();

test("registered read renderer hides successful text content until expanded", () => {
  process.env.CODE_PREVIEW_TOOLS = "read";
  const previousSettings = cloneCodePreviewSettingsForTest();
  setCodePreviewSettings({ ...defaultCodePreviewSettings, readContentPreview: false });
  try {
    const read = findRenderer(registerRenderers(), "read");
    assert.ok(read.renderCall);
    assert.ok(read.renderResult);

    const call = stripAnsi(
      renderComponent(read.renderCall({ path: "src/a.ts" }, testTheme(), {} as never)),
    );
    assert.match(call, /read src\/a\.ts/);

    const collapsed = stripAnsi(
      renderComponent(
        read.renderResult(
          { content: [{ type: "text", text: "const secret = 1;" }] },
          { expanded: false, isPartial: false },
          testTheme(),
          { args: { path: "src/a.ts" }, isError: false, invalidate: () => undefined, state: {} },
        ),
      ),
    );
    assert.match(collapsed, /expand/);

    const expanded = stripAnsi(
      renderComponent(
        read.renderResult(
          { content: [{ type: "text", text: "const secret = 1;" }] },
          { expanded: true, isPartial: false },
          testTheme(),
          { args: { path: "src/a.ts" }, isError: false, invalidate: () => undefined, state: {} },
        ),
      ),
    );
    assert.match(expanded, /const secret = 1/);
  } finally {
    setCodePreviewSettings(previousSettings);
  }
});

test("registered read renderer distinguishes blank-only files from empty files", () => {
  process.env.CODE_PREVIEW_TOOLS = "read";
  const read = findRenderer(registerRenderers(), "read");
  assert.ok(read.renderResult);

  const rendered = stripAnsi(
    renderComponent(
      read.renderResult(
        { content: [{ type: "text", text: "\n\n" }] },
        { expanded: true, isPartial: false },
        testTheme(),
        { args: { path: "blank.txt" }, isError: false, invalidate: () => undefined, state: {} },
      ),
    ),
  );

  assert.doesNotMatch(rendered, /Empty file/);
  assert.match(rendered, /1 │ /);
});

test("registered read renderer leaves image rendering to pi", () => {
  process.env.CODE_PREVIEW_TOOLS = "read";
  const read = findRenderer(registerRenderers(), "read");
  assert.ok(read.renderResult);
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

test("registered read renderer does not classify successful Error-prefixed content as failures", () => {
  process.env.CODE_PREVIEW_TOOLS = "read";
  const read = findRenderer(registerRenderers(), "read");
  assert.ok(read.renderResult);

  const rendered = stripAnsi(
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
  assert.match(rendered, /ErrorBoundary/);
  assert.match(rendered, /ok/);
});
