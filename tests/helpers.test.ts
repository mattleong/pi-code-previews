import assert from "node:assert/strict";
import { test } from "node:test";
import { getBashWarnings } from "../src/bash-warnings.js";
import { summarizeDiff } from "../src/diff.js";
import { resolvePreviewLanguage } from "../src/language.js";
import { formatDisplayPath } from "../src/paths.js";
import { getSecretWarnings } from "../src/secret-warnings.js";
import { defaultCodePreviewSettings, normalizeSettings, updateSetting } from "../src/settings.js";

test("resolvePreviewLanguage handles filenames, shebangs, and conservative content", () => {
	assert.equal(resolvePreviewLanguage({ path: ".env.local" }), "dotenv");
	assert.equal(resolvePreviewLanguage({ path: "Dockerfile.dev" }), "dockerfile");
	assert.equal(resolvePreviewLanguage({ path: "Makefile" }), "makefile");
	assert.equal(resolvePreviewLanguage({ path: "script", content: "#!/usr/bin/env python3\nprint('hi')" }), "python");
	assert.equal(resolvePreviewLanguage({ path: "data", content: '{"ok":true}' }), "json");
	assert.equal(resolvePreviewLanguage({ path: "unknown", content: "hello world" }), undefined);
});

test("getBashWarnings returns user-facing labels", () => {
	assert.deepEqual(getBashWarnings("sudo rm -rf build"), ["recursive delete", "elevated privileges"]);
	assert.deepEqual(getBashWarnings("git reset --hard && git clean -fd"), ["discards git changes", "removes untracked files"]);
	assert.deepEqual(getBashWarnings("echo hi"), []);
});

test("getSecretWarnings detects common secret-looking values", () => {
	assert.deepEqual(getSecretWarnings("OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz"), ["API key"]);
	assert.deepEqual(getSecretWarnings("token=ghp_abcdefghijklmnopqrstuvwxyz123456"), ["GitHub token"]);
	assert.deepEqual(getSecretWarnings("hello world"), []);
});

test("summarizeDiff classifies replacements, insertions, and deletions by change group", () => {
	const balanced = summarizeDiff("- 1 old\n- 2 old\n+ 1 new\n+ 2 new");
	assert.equal(balanced.additions, 2);
	assert.equal(balanced.removals, 2);
	assert.equal(balanced.replacements, 1);
	assert.equal(balanced.insertions, 0);
	assert.equal(balanced.deletions, 0);

	const withExtraLines = summarizeDiff("- 1 old\n+ 1 new\n+ 2 inserted\n context\n- 3 removed");
	assert.equal(withExtraLines.additions, 2);
	assert.equal(withExtraLines.removals, 2);
	assert.equal(withExtraLines.replacements, 1);
	assert.equal(withExtraLines.insertions, 1);
	assert.equal(withExtraLines.deletions, 1);
	assert.equal(withExtraLines.hunks, 2);
});

test("formatDisplayPath shortens paths relative to cwd", () => {
	assert.equal(formatDisplayPath("/tmp/project/src/file.ts", "/tmp/project"), "src/file.ts");
	assert.equal(formatDisplayPath("src/file.ts", "/tmp/project"), "src/file.ts");
});

test("settings normalization and reset preserve defaults", () => {
	const normalized = normalizeSettings({ syntaxHighlighting: false, secretWarnings: false, bashWarnings: false, readCollapsedLines: -1 });
	assert.equal(normalized.syntaxHighlighting, false);
	assert.equal(normalized.secretWarnings, false);
	assert.equal(normalized.bashWarnings, false);
	assert.equal(normalized.readCollapsedLines, defaultCodePreviewSettings.readCollapsedLines);
	assert.deepEqual(updateSetting(normalized, "resetToDefaults", "reset now"), defaultCodePreviewSettings);
});
