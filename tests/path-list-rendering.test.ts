import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { renderPathListLines } from "../src/path-list-rendering.ts";
import { codePreviewSettings, setCodePreviewSettings } from "../src/settings.ts";
import { stripAnsi, testTheme } from "./test-utils.ts";

let previousCodePreviewSettings = { ...codePreviewSettings };

beforeEach(() => {
  previousCodePreviewSettings = { ...codePreviewSettings };
});

afterEach(() => {
  setCodePreviewSettings(previousCodePreviewSettings);
});

test("renderPathListLines groups nested paths", () => {
  const lines = renderPathListLines(
    "src/renderers.ts\nsrc/diff.ts\ntests/helpers.test.ts",
    "/tmp/project",
    testTheme(),
  );
  const plain = stripAnsi(lines.join("\n"));
  assert.match(plain, /▸ src\//);
  assert.match(plain, /• renderers\.ts/);
  assert.match(plain, /▸ tests\//);
});

test("path list rendering can disable icons or use Nerd Font icons", () => {
  setCodePreviewSettings({ ...codePreviewSettings, pathIcons: "off" });
  assert.doesNotMatch(
    stripAnsi(renderPathListLines("src/renderers.ts", "/tmp/project", testTheme()).join("\n")),
    /[▸•]/,
  );

  setCodePreviewSettings({ ...codePreviewSettings, pathIcons: "nerd" });
  assert.match(
    stripAnsi(renderPathListLines("src/renderers.ts", "/tmp/project", testTheme()).join("\n")),
    /\ue5ff src\//,
  );
  assert.match(
    stripAnsi(renderPathListLines("src/renderers.ts", "/tmp/project", testTheme()).join("\n")),
    /\ue628 renderers\.ts/,
  );
});
