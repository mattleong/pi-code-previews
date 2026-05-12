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

test("registered bash renderer can hide all successful output while preserving errors", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash";
  const previousSettings = cloneCodePreviewSettingsForTest();
  setCodePreviewSettings({ ...defaultCodePreviewSettings, bashResultPreview: false });
  try {
    const bash = findRenderer(registerRenderers(), "bash");
    assert.ok(bash.renderResult);

    const successCollapsed = stripAnsi(
      renderComponent(
        bash.renderResult(
          { content: [{ type: "text", text: "hidden output" }] },
          { expanded: false, isPartial: false },
          testTheme(),
          { args: { command: "npm test" }, isError: false, invalidate: () => undefined, state: {} },
        ),
      ),
    );
    assert.match(successCollapsed, /expand/);

    const successExpanded = stripAnsi(
      renderComponent(
        bash.renderResult(
          { content: [{ type: "text", text: "hidden output" }] },
          { expanded: true, isPartial: false },
          testTheme(),
          { args: { command: "npm test" }, isError: false, invalidate: () => undefined, state: {} },
        ),
      ),
    );
    assert.match(successExpanded, /hidden output/);

    const error = stripAnsi(
      renderComponent(
        bash.renderResult(
          { content: [{ type: "text", text: "failed output" }] },
          { expanded: true, isPartial: false },
          testTheme(),
          { args: { command: "npm test" }, isError: true, invalidate: () => undefined, state: {} },
        ),
      ),
    );
    assert.match(error, /failed output/);
  } finally {
    setCodePreviewSettings(previousSettings);
  }
});

test("registered bash renderer mutes successful output while preserving error color", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash";
  const bash = findRenderer(registerRenderers(), "bash");
  assert.ok(bash.renderResult);

  const coloredTheme = {
    ...testTheme(),
    fg: (key: string, text: string) =>
      ["muted", "error"].includes(key) ? `<${key}>${text}</${key}>` : text,
  };

  const success = renderComponent(
    bash.renderResult(
      { content: [{ type: "text", text: "ok" }] },
      { expanded: true, isPartial: false },
      coloredTheme,
      { args: {}, isError: false, invalidate: () => undefined, state: {} },
    ),
  );
  assert.equal(success.trimEnd(), "<muted>ok</muted>");

  const error = renderComponent(
    bash.renderResult(
      { content: [{ type: "text", text: "failed" }] },
      { expanded: true, isPartial: false },
      coloredTheme,
      { args: {}, isError: true, invalidate: () => undefined, state: {} },
    ),
  );
  assert.equal(error.trimEnd(), "<error>failed</error>");
});

test("registered bash renderer hides grep, find, and ls command output when matching previews are off", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash";
  const previousSettings = cloneCodePreviewSettingsForTest();
  setCodePreviewSettings({
    ...defaultCodePreviewSettings,
    grepResultPreview: false,
    findResultPreview: false,
    lsResultPreview: false,
  });
  try {
    const bash = findRenderer(registerRenderers(), "bash");
    assert.ok(bash.renderResult);

    for (const command of [
      "grep -n TODO src/a.ts",
      "ls src/tool-renderers | head -5",
      "find src/tool-renderers -maxdepth 1 -name '*.ts'",
    ]) {
      const collapsed = stripAnsi(
        renderComponent(
          bash.renderResult(
            { content: [{ type: "text", text: "hidden output" }] },
            { expanded: false, isPartial: false },
            testTheme(),
            { args: { command }, isError: false, invalidate: () => undefined, state: {} },
          ),
        ),
      );
      assert.match(collapsed, /expand/);

      const expanded = stripAnsi(
        renderComponent(
          bash.renderResult(
            { content: [{ type: "text", text: "hidden output" }] },
            { expanded: true, isPartial: false },
            testTheme(),
            { args: { command }, isError: false, invalidate: () => undefined, state: {} },
          ),
        ),
      );
      assert.match(expanded, /hidden output/);
    }
  } finally {
    setCodePreviewSettings(previousSettings);
  }
});

test("registered bash renderer escapes terminal control characters in raw output", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash";
  const bash = findRenderer(registerRenderers(), "bash");
  assert.ok(bash.renderResult);

  const rendered = renderComponent(
    bash.renderResult(
      { content: [{ type: "text", text: "ok \x1b[31mred\x00" }] },
      { expanded: true, isPartial: false },
      testTheme(),
      { args: {}, isError: false, invalidate: () => undefined, state: {} },
    ),
  );
  assert.doesNotMatch(rendered, /\x1b\[31m/);
  assert.match(rendered, /␛\[31mred�/);
});

test("registered bash renderer preserves whitespace-sensitive output", () => {
  process.env.CODE_PREVIEW_TOOLS = "bash";
  const bash = findRenderer(registerRenderers(), "bash");
  assert.ok(bash.renderResult);

  const output = renderComponent(
    bash.renderResult(
      { content: [{ type: "text", text: "  indented\n" }] },
      { expanded: true, isPartial: false },
      testTheme(),
      { args: {}, isError: false, invalidate: () => undefined, state: {} },
    ),
    "  indented".length,
  );
  assert.equal(stripAnsi(output), "  indented");

  const blankOutput = stripAnsi(
    renderComponent(
      bash.renderResult(
        { content: [{ type: "text", text: "   \n" }] },
        { expanded: true, isPartial: false },
        testTheme(),
        { args: {}, isError: false, invalidate: () => undefined, state: {} },
      ),
    ),
  );
  assert.doesNotMatch(blankOutput, /No output/);
});
