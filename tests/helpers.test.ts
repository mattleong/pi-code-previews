import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { Box, visibleWidth, type Component } from "@mariozechner/pi-tui";
import { test } from "node:test";
import { getBashWarnings } from "../src/bash-warnings.js";
import { FullWidthDiffText, renderPlainDiff, renderSyntaxHighlightedDiff, summarizeDiff } from "../src/diff.js";
import { trimSingleTrailingNewline } from "../src/format.js";
import { resolvePreviewLanguage } from "../src/language.js";
import { parseGrepOutputLine } from "../src/grep-rendering.js";
import { renderPathListLines } from "../src/path-list-rendering.js";
import { formatDisplayPath } from "../src/paths.js";
import { createSimpleDiff, getMaxWriteDiffBytes, getWriteDiffSkipReason, readExistingFileForPreview, resolvePreviewPath } from "../src/write-diff.js";
import { getSecretWarnings } from "../src/secret-warnings.js";
import { codePreviewSettings, defaultCodePreviewSettings, normalizeSettings, setCodePreviewSettings, updateSetting } from "../src/settings.js";
import { extractCodePreviewSettings } from "../src/settings-store.js";
import { formatEnabledCodePreviewTools, getEnabledCodePreviewTools } from "../src/tool-selection.js";
import { registerToolRenderers } from "../src/renderers.js";

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

test("parseGrepOutputLine handles hyphenated filenames, context lines, and empty matches", () => {
	assert.deepEqual(parseGrepOutputLine("src/foo-1-bar.ts:42: const x = 1;"), {
		path: "src/foo-1-bar.ts",
		lineNumber: "42",
		code: "const x = 1;",
		kind: "match",
	});
	assert.deepEqual(parseGrepOutputLine("src/foo-1-bar.ts-43- return x;"), {
		path: "src/foo-1-bar.ts",
		lineNumber: "43",
		code: "return x;",
		kind: "context",
	});
	assert.deepEqual(parseGrepOutputLine("src/blank.ts:3: "), {
		path: "src/blank.ts",
		lineNumber: "3",
		code: "",
		kind: "match",
	});
	assert.deepEqual(parseGrepOutputLine("src/blank.ts-4- "), {
		path: "src/blank.ts",
		lineNumber: "4",
		code: "",
		kind: "context",
	});
});

test("createSimpleDiff keeps separated changes distinct", () => {
	const diff = createSimpleDiff("a\nold one\nkeep\nold two\nz", "a\nnew one\nkeep\nnew two\nz");
	assert.match(diff, /-2 old one/);
	assert.match(diff, /\+2 new one/);
	assert.match(diff, / 3 keep/);
	assert.match(diff, /-4 old two/);
	assert.match(diff, /\+4 new two/);
	assert.doesNotMatch(diff, /-3 keep/);
	assert.doesNotMatch(diff, /\+3 keep/);
});

test("resolvePreviewPath handles @, ~, and relative paths", () => {
	assert.equal(resolvePreviewPath("@src/file.ts", "/tmp/project"), "/tmp/project/src/file.ts");
	assert.equal(resolvePreviewPath("src/file.ts", "/tmp/project"), "/tmp/project/src/file.ts");
	assert.equal(resolvePreviewPath("~/file.ts", "/tmp/project").endsWith("/file.ts"), true);
});

test("readExistingFileForPreview returns bounded previous content", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-code-previews-"));
	try {
		await writeFile(join(dir, "small.txt"), "before", "utf8");
		assert.deepEqual(await readExistingFileForPreview("small.txt", dir, "after"), { kind: "content", content: "before" });

		await writeFile(join(dir, "large.txt"), "x".repeat(getMaxWriteDiffBytes() + 1), "utf8");
		const skipped = await readExistingFileForPreview("large.txt", dir, "after");
		assert.equal(skipped?.kind, "skipped");
		assert.match(getWriteDiffSkipReason(skipped, "after") ?? "", /previous file too large/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("renderPathListLines groups nested paths", () => {
	const lines = renderPathListLines("src/renderers.ts\nsrc/diff.ts\ntests/helpers.test.ts", "/tmp/project", testTheme());
	const plain = stripAnsi(lines.join("\n"));
	assert.match(plain, /▸ src\//);
	assert.match(plain, /• renderers\.ts/);
	assert.match(plain, /▸ tests\//);
});

test("path list rendering can disable icons or use Nerd Font icons", () => {
	const previous = { ...codePreviewSettings };
	try {
		setCodePreviewSettings({ ...codePreviewSettings, pathIcons: "off" });
		assert.doesNotMatch(stripAnsi(renderPathListLines("src/renderers.ts", "/tmp/project", testTheme()).join("\n")), /[▸•]/);

		setCodePreviewSettings({ ...codePreviewSettings, pathIcons: "nerd" });
		assert.match(stripAnsi(renderPathListLines("src/renderers.ts", "/tmp/project", testTheme()).join("\n")), /\ue5ff src\//);
		assert.match(stripAnsi(renderPathListLines("src/renderers.ts", "/tmp/project", testTheme()).join("\n")), /\ue628 renderers\.ts/);
	} finally {
		setCodePreviewSettings(previous);
	}
});

test("CODE_PREVIEW_TOOLS selects enabled renderers", () => {
	const previous = process.env.CODE_PREVIEW_TOOLS;
	process.env.CODE_PREVIEW_TOOLS = "write,edit,grep";
	try {
		assert.deepEqual([...getEnabledCodePreviewTools()], ["write", "edit", "grep"]);
		assert.equal(formatEnabledCodePreviewTools(), "write, edit, grep");
	} finally {
		if (previous === undefined) delete process.env.CODE_PREVIEW_TOOLS;
		else process.env.CODE_PREVIEW_TOOLS = previous;
	}
});

test("settings normalization and reset preserve defaults", () => {
	const normalized = normalizeSettings({ syntaxHighlighting: false, secretWarnings: false, bashWarnings: false, readCollapsedLines: -1 });
	assert.equal(normalized.syntaxHighlighting, false);
	assert.equal(normalized.secretWarnings, false);
	assert.equal(normalized.bashWarnings, false);
	assert.equal(normalized.readCollapsedLines, defaultCodePreviewSettings.readCollapsedLines);
	assert.deepEqual(updateSetting(normalized, "resetToDefaults", "reset now"), defaultCodePreviewSettings);
});

test("settings normalization falls back to accumulated settings for invalid overrides", () => {
	const fallback = { ...defaultCodePreviewSettings, shikiTheme: "github-dark", readCollapsedLines: 40 };
	const invalidOverride = normalizeSettings({ shikiTheme: "not-a-theme", readCollapsedLines: -1 }, fallback);
	assert.equal(invalidOverride.shikiTheme, "github-dark");
	assert.equal(invalidOverride.readCollapsedLines, 40);

	const validOverride = normalizeSettings({ shikiTheme: "dark-plus", readCollapsedLines: 20 }, fallback);
	assert.equal(validOverride.shikiTheme, "dark-plus");
	assert.equal(validOverride.readCollapsedLines, 20);
});

test("extractCodePreviewSettings accepts nested, prefixed, and saved raw settings", () => {
	assert.deepEqual(extractCodePreviewSettings({ codePreview: { readCollapsedLines: 20 } }), { readCollapsedLines: 20 });
	assert.deepEqual(extractCodePreviewSettings({ codePreviewReadCollapsedLines: 30 }), { readCollapsedLines: 30 });
	assert.deepEqual(extractCodePreviewSettings({ ...defaultCodePreviewSettings, readCollapsedLines: 40 }).readCollapsedLines, 40);
	assert.deepEqual(extractCodePreviewSettings({ theme: "dark" }), {});
});

test("trimSingleTrailingNewline preserves leading and meaningful trailing spaces", () => {
	assert.equal(trimSingleTrailingNewline("  indented\n"), "  indented");
	assert.equal(trimSingleTrailingNewline("   \n"), "   ");
	assert.equal(trimSingleTrailingNewline("line\r\n"), "line");
	assert.equal(trimSingleTrailingNewline("line\n\n"), "line\n");
});

test("plain diff escapes terminal control characters", () => {
	const rendered = renderPlainDiff("+1 hello \x1b[31mred\x00", testTheme(), 1);
	assert.doesNotMatch(rendered, /\x1b\[31m/);
	assert.match(rendered, /␛\[31mred�/);
});

test("diff renderers honor limits at remove/add boundaries", () => {
	const diff = "-1 old\n+1 new";
	assert.equal(renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 1).split("\n").length, 1);
	assert.equal(renderPlainDiff(diff, testTheme(), 1).split("\n").length, 1);
});

test("full-width diff component wraps long ANSI lines", () => {
	const diffText = renderPlainDiff("+1 " + "x".repeat(80), testTheme(), 1);
	const rows = new FullWidthDiffText(diffText, testTheme()).render(30);
	assert.ok(rows.length > 1);
	assert.equal(visibleWidth(rows[0] ?? ""), 30);
	assert.ok(visibleWidth(rows.at(-1) ?? "") <= 30);
});

test("diff background reaches box right padding without exceeding child width", () => {
	const box = new Box(1, 0, (text) => `\x1b[48;2;1;1;1m${text}\x1b[49m`);
	box.addChild(new FullWidthDiffText(renderPlainDiff("+1 short", testTheme(), 1), testTheme()));
	const line = box.render(20)[0] ?? "";
	assert.equal(visibleWidth(line), 20);
	assert.match(line, /\x1b\[48;2;10;42;26m[^\n]* \x1b\[49m$/);
});

test("word emphasis pairs the most similar lines inside change blocks", () => {
	const diff = "-1 const trimmed = line.trim();\n+1 const safeLine = escapeControlChars(line);\n+2 const trimmed = safeLine.trim();";
	const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 3).split("\n");
	assert.doesNotMatch(rendered[1] ?? "", /\x1b\[48;2;64;132;82m/);
	assert.match(rendered[2] ?? "", /\x1b\[48;2;64;132;82m\x1b\[1msafeLine/);
	assert.match(rendered[0] ?? "", /\x1b\[48;2;148;62;70m\x1b\[1mline/);
});

test("word emphasis ignores lines that only share punctuation or method shape", () => {
	const diff = "-1 out.push(pair.removed, pair.added);\n+1 block.push(next);";
	const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 2).split("\n");
	assert.doesNotMatch(rendered[0] ?? "", /\x1b\[48;2;148;62;70m/);
	assert.doesNotMatch(rendered[1] ?? "", /\x1b\[48;2;64;132;82m/);
});

test("word emphasis ranges stay aligned when indentation changes", () => {
	const diff = "-1 \tconst next = parseDiffLine(lines[i + 1]!);\n+1 \t\tconst next = parseDiffLine(lines[end]!);";
	const rendered = renderSyntaxHighlightedDiff(diff, undefined, testTheme(), 2).split("\n");
	assert.match(rendered[0] ?? "", /lines\[\x1b\[48;2;148;62;70m\x1b\[1mi \+ 1/);
	assert.match(rendered[1] ?? "", /lines\[\x1b\[48;2;64;132;82m\x1b\[1mend/);
});

test("word emphasis highlights long shared lines with appended text", () => {
	const diff = "-119 You can also put code-preview defaults in `.pi/settings.json` globally or per project:\n+123 You can also put code-preview defaults in `.pi/settings.json` globally or per project. Project settings override global settings, and the package settings file overrides both:";
	const rendered = renderSyntaxHighlightedDiff(diff, "markdown", testTheme(), 2).split("\n");
	assert.doesNotMatch(rendered[0] ?? "", /\x1b\[48;2;148;62;70m/);
	assert.match(rendered[1] ?? "", /\x1b\[48;2;64;132;82m\x1b\[1m\. Project settings override global settings/);
});

test("registered grep renderer highlights multiple matches on one line", () => {
	const previous = process.env.CODE_PREVIEW_TOOLS;
	process.env.CODE_PREVIEW_TOOLS = "grep";
	try {
		const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
		registerToolRenderers({ registerTool: (tool: unknown) => registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }) } as never, "/tmp/project");
		const grep = registered.find((tool) => tool.name === "grep");
		assert.ok(grep?.renderResult);
		const rendered = renderComponent(grep.renderResult(
			{ content: [{ type: "text", text: "src/a.ts:1: foo foo foo" }] },
			{ expanded: true, isPartial: false },
			testTheme(),
			{ args: { pattern: "foo", literal: true }, isError: false, invalidate: () => undefined, state: {} },
		));
		assert.equal((rendered.match(/\x1b\[48;2;90;74;28m/g) ?? []).length, 3);
	} finally {
		if (previous === undefined) delete process.env.CODE_PREVIEW_TOOLS;
		else process.env.CODE_PREVIEW_TOOLS = previous;
	}
});

test("registered edit call previews proposed edits before execution", () => {
	const previous = process.env.CODE_PREVIEW_TOOLS;
	process.env.CODE_PREVIEW_TOOLS = "edit";
	try {
		const registered: Array<{ name: string; renderCall?: (...args: unknown[]) => Component }> = [];
		registerToolRenderers({ registerTool: (tool: unknown) => registered.push(tool as { name: string; renderCall?: (...args: unknown[]) => Component }) } as never, "/tmp/project");
		const edit = registered.find((tool) => tool.name === "edit");
		assert.ok(edit?.renderCall);
		const args = { path: "src/a.ts", edits: [{ oldText: "const value = 1;", newText: "const value = 2;" }] };
		const state = {};
		const pendingComponent = edit.renderCall(
			args,
			testTheme(),
			{ argsComplete: true, expanded: true, executionStarted: false, lastComponent: undefined, state, invalidate: () => undefined },
		);
		const rendered = stripAnsi(renderComponent(pendingComponent));
		assert.match(rendered, /edit src\/a\.ts/);
		assert.match(rendered, /proposed edit/);
		assert.match(rendered, /const value = 1;/);
		assert.match(rendered, /const value = 2;/);

		const started = stripAnsi(renderComponent(edit.renderCall(
			args,
			testTheme(),
			{ argsComplete: true, expanded: true, executionStarted: true, lastComponent: pendingComponent, state, invalidate: () => undefined },
		)));
		assert.match(started, /edit src\/a\.ts/);
		assert.doesNotMatch(started, /proposed edit/);
	} finally {
		if (previous === undefined) delete process.env.CODE_PREVIEW_TOOLS;
		else process.env.CODE_PREVIEW_TOOLS = previous;
	}
});

test("registered read renderer leaves image rendering to pi", () => {
	const previousTools = process.env.CODE_PREVIEW_TOOLS;
	process.env.CODE_PREVIEW_TOOLS = "read";
	try {
		const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
		registerToolRenderers({ registerTool: (tool: unknown) => registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }) } as never, "/tmp/project");
		const read = registered.find((tool) => tool.name === "read");
		assert.ok(read?.renderResult);
		const rendered = renderComponent(read.renderResult(
			{ content: [{ type: "text", text: "Read image file [image/png]" }, { type: "image", data: Buffer.from("png").toString("base64"), mimeType: "image/png" }] },
			{ expanded: true, isPartial: false },
			testTheme(),
			{ args: { path: "asset.png" }, isError: false, invalidate: () => undefined, state: {} },
		));
		assert.equal(stripAnsi(rendered).trimEnd(), "image [image/png]");
		assert.doesNotMatch(rendered, /\x1b\]1337;File=|\x1b_G/);
	} finally {
		if (previousTools === undefined) delete process.env.CODE_PREVIEW_TOOLS;
		else process.env.CODE_PREVIEW_TOOLS = previousTools;
	}
});

test("registered renderers escape terminal control characters in raw output", () => {
	const previous = process.env.CODE_PREVIEW_TOOLS;
	process.env.CODE_PREVIEW_TOOLS = "bash,grep";
	try {
		const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
		registerToolRenderers({ registerTool: (tool: unknown) => registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }) } as never, "/tmp/project");
		const bash = registered.find((tool) => tool.name === "bash");
		const grep = registered.find((tool) => tool.name === "grep");
		assert.ok(bash?.renderResult);
		assert.ok(grep?.renderResult);

		const bashRendered = renderComponent(bash.renderResult(
			{ content: [{ type: "text", text: "ok \x1b[31mred\x00" }] },
			{ expanded: true, isPartial: false },
			testTheme(),
			{ args: {}, isError: false, invalidate: () => undefined, state: {} },
		));
		assert.doesNotMatch(bashRendered, /\x1b\[31m/);
		assert.match(bashRendered, /␛\[31mred�/);

		const grepRendered = renderComponent(grep.renderResult(
			{ content: [{ type: "text", text: "unparsed \x1b[31mred\x00" }] },
			{ expanded: true, isPartial: false },
			testTheme(),
			{ args: { pattern: "red" }, isError: false, invalidate: () => undefined, state: {} },
		));
		assert.doesNotMatch(grepRendered, /\x1b\[31m/);
		assert.match(grepRendered, /␛\[31mred�/);
	} finally {
		if (previous === undefined) delete process.env.CODE_PREVIEW_TOOLS;
		else process.env.CODE_PREVIEW_TOOLS = previous;
	}
});

test("registered read and grep renderers do not classify successful Error-prefixed content as failures", () => {
	const previous = process.env.CODE_PREVIEW_TOOLS;
	process.env.CODE_PREVIEW_TOOLS = "read,grep";
	try {
		const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
		registerToolRenderers({ registerTool: (tool: unknown) => registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }) } as never, "/tmp/project");
		const read = registered.find((tool) => tool.name === "read");
		const grep = registered.find((tool) => tool.name === "grep");
		assert.ok(read?.renderResult);
		assert.ok(grep?.renderResult);

		const readRendered = stripAnsi(renderComponent(read.renderResult(
			{ content: [{ type: "text", text: "ErrorBoundary\nok" }] },
			{ expanded: true, isPartial: false },
			testTheme(),
			{ args: { path: "src/ErrorBoundary.tsx" }, isError: false, invalidate: () => undefined, state: {} },
		)));
		assert.match(readRendered, /ErrorBoundary/);
		assert.match(readRendered, /ok/);

		const grepRendered = stripAnsi(renderComponent(grep.renderResult(
			{ content: [{ type: "text", text: "ErrorLog.ts:1: Error found" }] },
			{ expanded: true, isPartial: false },
			testTheme(),
			{ args: { pattern: "Error" }, isError: false, invalidate: () => undefined, state: {} },
		)));
		assert.match(grepRendered, /ErrorLog\.ts\s*\n/);
		assert.match(grepRendered, /\s1 │ Error found/);
	} finally {
		if (previous === undefined) delete process.env.CODE_PREVIEW_TOOLS;
		else process.env.CODE_PREVIEW_TOOLS = previous;
	}
});

test("registered find and ls renderers keep error results out of path-list formatting", () => {
	const previous = process.env.CODE_PREVIEW_TOOLS;
	process.env.CODE_PREVIEW_TOOLS = "find,ls";
	try {
		const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
		registerToolRenderers({ registerTool: (tool: unknown) => registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }) } as never, "/tmp/project");
		for (const name of ["find", "ls"]) {
			const tool = registered.find((candidate) => candidate.name === name);
			assert.ok(tool?.renderResult);
			const rendered = stripAnsi(renderComponent(tool.renderResult(
				{ content: [{ type: "text", text: "Path not found: /tmp/nope" }] },
				{ expanded: true, isPartial: false },
				testTheme(),
				{ args: {}, isError: true, invalidate: () => undefined, state: {} },
			)));
			assert.equal(rendered.trimEnd(), "Path not found: /tmp/nope");
			assert.doesNotMatch(rendered, /[▸•]/);
		}
	} finally {
		if (previous === undefined) delete process.env.CODE_PREVIEW_TOOLS;
		else process.env.CODE_PREVIEW_TOOLS = previous;
	}
});

test("registered bash and grep renderers preserve whitespace-sensitive output", () => {
	const previous = process.env.CODE_PREVIEW_TOOLS;
	process.env.CODE_PREVIEW_TOOLS = "bash,grep";
	try {
		const registered: Array<{ name: string; renderResult?: (...args: unknown[]) => Component }> = [];
		registerToolRenderers({ registerTool: (tool: unknown) => registered.push(tool as { name: string; renderResult?: (...args: unknown[]) => Component }) } as never, "/tmp/project");
		const bash = registered.find((tool) => tool.name === "bash");
		const grep = registered.find((tool) => tool.name === "grep");
		assert.ok(bash?.renderResult);
		assert.ok(grep?.renderResult);

		const bashOutput = renderComponent(bash.renderResult(
			{ content: [{ type: "text", text: "  indented\n" }] },
			{ expanded: true, isPartial: false },
			testTheme(),
			{ args: {}, isError: false, invalidate: () => undefined, state: {} },
		), "  indented".length);
		assert.equal(stripAnsi(bashOutput), "  indented");

		const blankBashOutput = stripAnsi(renderComponent(bash.renderResult(
			{ content: [{ type: "text", text: "   \n" }] },
			{ expanded: true, isPartial: false },
			testTheme(),
			{ args: {}, isError: false, invalidate: () => undefined, state: {} },
		)));
		assert.doesNotMatch(blankBashOutput, /No output/);

		const grepOutput = stripAnsi(renderComponent(grep.renderResult(
			{ content: [{ type: "text", text: "src/blank.ts:3: \n" }] },
			{ expanded: true, isPartial: false },
			testTheme(),
			{ args: { pattern: "^$" }, isError: false, invalidate: () => undefined, state: {} },
		)));
		assert.match(grepOutput, /src\/blank\.ts/);
		assert.match(grepOutput, /\s3 │ /);
	} finally {
		if (previous === undefined) delete process.env.CODE_PREVIEW_TOOLS;
		else process.env.CODE_PREVIEW_TOOLS = previous;
	}
});

test("registered edit renderer preserves built-in metadata and prepareArguments shim", () => {
	const previous = process.env.CODE_PREVIEW_TOOLS;
	process.env.CODE_PREVIEW_TOOLS = "edit";
	try {
		const registered: unknown[] = [];
		registerToolRenderers({ registerTool: (tool: unknown) => registered.push(tool) } as never, "/tmp/project");
		const edit = registered[0] as { name: string; prepareArguments?: (args: unknown) => unknown; promptSnippet?: string; promptGuidelines?: string[] };
		assert.equal(edit.name, "edit");
		assert.equal(typeof edit.prepareArguments, "function");
		assert.equal(typeof edit.promptSnippet, "string");
		assert.ok(edit.promptGuidelines?.length);
		assert.deepEqual(edit.prepareArguments?.({ path: "a.txt", oldText: "a", newText: "b" }), { path: "a.txt", edits: [{ oldText: "a", newText: "b" }] });
	} finally {
		if (previous === undefined) delete process.env.CODE_PREVIEW_TOOLS;
		else process.env.CODE_PREVIEW_TOOLS = previous;
	}
});

function renderComponent(component: Component, width = 100): string {
	return component.render(width).join("\n");
}

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

function testTheme(): Theme {
	return {
		bold: (text: string) => text,
		fg: (_key: string, text: string) => text,
	} as Theme;
}
