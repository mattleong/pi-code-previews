import assert from "node:assert/strict";
import { test } from "vitest";
import { defaultCodePreviewSettings, setCodePreviewSettings } from "../../settings/index";
import {
  cloneCodePreviewSettingsForTest,
  renderComponent,
  stripAnsi,
  testTheme,
} from "../../testing/render";
import { findRenderer, preserveCodePreviewToolsEnv, registerRenderers } from "../testing";

preserveCodePreviewToolsEnv();

test("path-list integration hides successful grep, find, and ls results until expanded", () => {
  process.env.CODE_PREVIEW_TOOLS = "grep,find,ls";
  const previousSettings = cloneCodePreviewSettingsForTest();
  setCodePreviewSettings({
    ...defaultCodePreviewSettings,
    grepResultPreview: false,
    findResultPreview: false,
    lsResultPreview: false,
  });
  try {
    const registered = registerRenderers();
    const cases = [
      {
        name: "grep",
        callArgs: { pattern: "TODO", path: "src" },
        resultText: "src/a.ts:1: TODO",
        contextArgs: { pattern: "TODO" },
      },
      {
        name: "find",
        callArgs: { pattern: "*.ts", path: "src" },
        resultText: "src/a.ts\nsrc/b.ts",
        contextArgs: {},
      },
      {
        name: "ls",
        callArgs: { path: "src" },
        resultText: "src/a.ts\nsrc/b.ts",
        contextArgs: {},
      },
    ];

    for (const testCase of cases) {
      const tool = findRenderer(registered, testCase.name);
      assert.ok(tool.renderCall);
      assert.ok(tool.renderResult);
      const call = stripAnsi(renderComponent(tool.renderCall(testCase.callArgs, testTheme())));
      assert.match(call, new RegExp(`\\b${testCase.name}\\b`));
      const collapsed = stripAnsi(
        renderComponent(
          tool.renderResult(
            { content: [{ type: "text", text: testCase.resultText }] },
            { expanded: false, isPartial: false },
            testTheme(),
            {
              args: testCase.contextArgs,
              isError: false,
              invalidate: () => undefined,
              state: {},
            },
          ),
        ),
      );
      assert.match(collapsed, /expand/);

      const expanded = stripAnsi(
        renderComponent(
          tool.renderResult(
            { content: [{ type: "text", text: testCase.resultText }] },
            { expanded: true, isPartial: false },
            testTheme(),
            {
              args: testCase.contextArgs,
              isError: false,
              invalidate: () => undefined,
              state: {},
            },
          ),
        ),
      );
      assert.match(expanded, /src\/a\.ts/);
    }
  } finally {
    setCodePreviewSettings(previousSettings);
  }
});

test("path-list integration keeps find and ls errors out of path-list formatting", () => {
  process.env.CODE_PREVIEW_TOOLS = "find,ls";
  const registered = registerRenderers();
  for (const name of ["find", "ls"]) {
    const tool = findRenderer(registered, name);
    assert.ok(tool.renderResult);
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
