import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { codePreviewSettings, setCodePreviewSettings } from "../settings/index";
import { initializeShiki, renderWithShiki } from "./shiki";

let previousCodePreviewSettings = { ...codePreviewSettings };

beforeEach(() => {
  previousCodePreviewSettings = { ...codePreviewSettings };
});

afterEach(async () => {
  setCodePreviewSettings(previousCodePreviewSettings);
  await initializeShiki(previousCodePreviewSettings.shikiTheme);
});

test("initializeShiki does not mutate configured settings", async () => {
  setCodePreviewSettings({
    ...codePreviewSettings,
    shikiTheme: "dark-plus",
    syntaxHighlighting: true,
  });
  await initializeShiki("github-light-high-contrast");

  assert.equal(codePreviewSettings.shikiTheme, "dark-plus");
});

test("light Shiki themes preserve their dark foreground colors", async () => {
  setCodePreviewSettings({
    ...codePreviewSettings,
    shikiTheme: "github-light-high-contrast",
    syntaxHighlighting: true,
  });
  await initializeShiki("github-light-high-contrast");

  const rendered = renderWithShiki("const value = 1;", "typescript")?.[0] ?? "";
  assert.doesNotMatch(rendered, /\x1b\[38;2;139;148;158m/);
  assert.match(rendered, /\x1b\[38;2;14;17;22m/);
});

test("dark Shiki themes still normalize low-contrast foreground colors", async () => {
  setCodePreviewSettings({
    ...codePreviewSettings,
    shikiTheme: "vitesse-black",
    syntaxHighlighting: true,
  });
  await initializeShiki("vitesse-black");

  const rendered = renderWithShiki("const value = 1;", "typescript")?.[0] ?? "";
  assert.match(rendered, /\x1b\[38;2;139;148;158m/);
  assert.doesNotMatch(rendered, /\x1b\[38;2;68;68;68m/);
});
