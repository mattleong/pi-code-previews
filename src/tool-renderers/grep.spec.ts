import assert from "node:assert/strict";
import { test } from "vitest";
import { renderComponent, stripAnsi, testTheme } from "../testing/render";
import { findRenderer, preserveCodePreviewToolsEnv, registerRenderers } from "./testing";

preserveCodePreviewToolsEnv();

test("registered grep renderer highlights literal matches only", () => {
  process.env.CODE_PREVIEW_TOOLS = "grep";
  const grep = findRenderer(registerRenderers(), "grep");
  assert.ok(grep.renderResult);
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

test("registered grep renderer escapes terminal control characters in raw output", () => {
  process.env.CODE_PREVIEW_TOOLS = "grep";
  const grep = findRenderer(registerRenderers(), "grep");
  assert.ok(grep.renderResult);

  const rendered = renderComponent(
    grep.renderResult(
      { content: [{ type: "text", text: "unparsed \x1b[31mred\x00" }] },
      { expanded: true, isPartial: false },
      testTheme(),
      { args: { pattern: "red" }, isError: false, invalidate: () => undefined, state: {} },
    ),
  );
  assert.doesNotMatch(rendered, /\x1b\[31m/);
  assert.match(rendered, /␛\[31mred�/);
});

test("registered grep renderer does not classify successful Error-prefixed content as failures", () => {
  process.env.CODE_PREVIEW_TOOLS = "grep";
  const grep = findRenderer(registerRenderers(), "grep");
  assert.ok(grep.renderResult);

  const rendered = stripAnsi(
    renderComponent(
      grep.renderResult(
        { content: [{ type: "text", text: "ErrorLog.ts:1: Error found" }] },
        { expanded: true, isPartial: false },
        testTheme(),
        { args: { pattern: "Error" }, isError: false, invalidate: () => undefined, state: {} },
      ),
    ),
  );
  assert.match(rendered, /ErrorLog\.ts\s*\n/);
  assert.match(rendered, /\s1 │ Error found/);
});

test("registered grep renderer preserves whitespace-sensitive output", () => {
  process.env.CODE_PREVIEW_TOOLS = "grep";
  const grep = findRenderer(registerRenderers(), "grep");
  assert.ok(grep.renderResult);

  const output = stripAnsi(
    renderComponent(
      grep.renderResult(
        { content: [{ type: "text", text: "src/blank.ts:3: \n" }] },
        { expanded: true, isPartial: false },
        testTheme(),
        { args: { pattern: "^$" }, isError: false, invalidate: () => undefined, state: {} },
      ),
    ),
  );
  assert.match(output, /src\/blank\.ts/);
  assert.match(output, /\s3 │ /);
});
