import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "vitest";
import { defaultCodePreviewSettings } from "./index";
import {
  extractCodePreviewSettings,
  getSettingsPath,
  loadSettingsFromDisk,
  saveSettingsToDisk,
} from "./store";

const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalHome = process.env.HOME;
const originalCwd = process.cwd();

afterEach(() => {
  if (originalPiCodingAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  process.chdir(originalCwd);
});

test("getSettingsPath uses Pi's agent directory resolution", () => {
  process.env.PI_CODING_AGENT_DIR = join("~", ".config", "pi");

  assert.equal(getSettingsPath(), join(homedir(), ".config", "pi", "code-previews.json"));
});

test("saveSettingsToDisk and loadSettingsFromDisk respect PI_CODING_AGENT_DIR", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "pi-code-previews-settings-"));
  process.env.PI_CODING_AGENT_DIR = configDir;

  await saveSettingsToDisk({ ...defaultCodePreviewSettings, readCollapsedLines: 37 });

  const saved = JSON.parse(await readFile(join(configDir, "code-previews.json"), "utf8"));
  assert.equal(saved.readCollapsedLines, 37);

  const loaded = await loadSettingsFromDisk();
  assert.equal(loaded?.readCollapsedLines, 37);
});

test("extractCodePreviewSettings accepts nested, prefixed, and saved raw settings", () => {
  assert.deepEqual(extractCodePreviewSettings({ codePreview: { readCollapsedLines: 20 } }), {
    readCollapsedLines: 20,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewReadCollapsedLines: 30 }), {
    readCollapsedLines: 30,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewReadContentPreview: false }), {
    readContentPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewWriteContentPreview: false }), {
    writeContentPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewEditDiffPreview: false }), {
    editDiffPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewGrepResultPreview: false }), {
    grepResultPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewFindResultPreview: false }), {
    findResultPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewLsResultPreview: false }), {
    lsResultPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewBashResultPreview: false }), {
    bashResultPreview: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewToolCallBackground: false }), {
    toolCallBackground: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewToolCallTiming: false }), {
    toolCallTiming: false,
  });
  assert.deepEqual(extractCodePreviewSettings({ codePreviewTools: ["bash", "write"] }), {
    tools: ["bash", "write"],
  });
  assert.deepEqual(
    extractCodePreviewSettings({ ...defaultCodePreviewSettings, readCollapsedLines: 40 })
      .readCollapsedLines,
    40,
  );
  assert.deepEqual(extractCodePreviewSettings({ pathIcons: "off" }), { pathIcons: "off" });
  assert.deepEqual(extractCodePreviewSettings({ theme: "dark" }), {});
});

test("loadSettingsFromDisk merges settings in precedence order", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-code-previews-precedence-"));
  const home = join(root, "home");
  const agentDir = join(root, "agent");
  const project = join(root, "project");
  process.env.HOME = home;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  await mkdir(join(home, ".pi", "agent"), { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await mkdir(join(project, ".pi"), { recursive: true });

  await writeJson(join(home, ".pi", "settings.json"), {
    codePreview: {
      readCollapsedLines: 11,
      writeCollapsedLines: 21,
      writeContentPreview: false,
    },
  });
  await writeJson(join(home, ".pi", "agent", "settings.json"), {
    codePreview: { readCollapsedLines: 12, editDiffPreview: false, grepCollapsedLines: 22 },
  });
  await writeJson(join(agentDir, "settings.json"), {
    codePreview: { readCollapsedLines: 13, findResultPreview: false },
  });
  await writeJson(join(project, ".pi", "settings.json"), {
    codePreview: { readCollapsedLines: 14, lsResultPreview: false },
  });
  await writeJson(join(home, ".pi", "agent", "code-previews.json"), {
    readCollapsedLines: 15,
    bashResultPreview: false,
  });
  await writeJson(join(agentDir, "code-previews.json"), {
    readCollapsedLines: 16,
    pathListCollapsedLines: 44,
  });

  const loaded = await loadSettingsFromDisk({ projectCwd: project });
  assert.equal(loaded?.readCollapsedLines, 16);
  assert.equal(loaded?.writeCollapsedLines, 21);
  assert.equal(loaded?.writeContentPreview, false);
  assert.equal(loaded?.editDiffPreview, false);
  assert.equal(loaded?.grepCollapsedLines, 22);
  assert.equal(loaded?.findResultPreview, false);
  assert.equal(loaded?.lsResultPreview, false);
  assert.equal(loaded?.bashResultPreview, false);
  assert.equal(loaded?.pathListCollapsedLines, 44);
});

test("loadSettingsFromDisk uses explicit project cwd instead of process cwd", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-code-previews-project-cwd-"));
  const home = join(root, "home");
  const agentDir = join(root, "agent");
  const targetProject = join(root, "target");
  const otherProject = join(root, "other");
  process.env.HOME = home;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  await mkdir(join(home, ".pi", "agent"), { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await mkdir(join(targetProject, ".pi"), { recursive: true });
  await mkdir(join(otherProject, ".pi"), { recursive: true });
  process.chdir(otherProject);

  await writeJson(join(targetProject, ".pi", "settings.json"), {
    codePreview: { readCollapsedLines: 24 },
  });
  await writeJson(join(otherProject, ".pi", "settings.json"), {
    codePreview: { readCollapsedLines: 99, writeCollapsedLines: 88 },
  });

  const loaded = await loadSettingsFromDisk({ projectCwd: targetProject });
  assert.equal(loaded?.readCollapsedLines, 24);
  assert.equal(loaded?.writeCollapsedLines, defaultCodePreviewSettings.writeCollapsedLines);
});

test("loadSettingsFromDisk warns on invalid JSON and continues", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-code-previews-invalid-settings-"));
  const home = join(root, "home");
  const agentDir = join(root, "agent");
  process.env.HOME = home;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  await mkdir(join(home, ".pi", "agent"), { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await writeJson(join(home, ".pi", "settings.json"), {
    codePreview: { readCollapsedLines: 18 },
  });
  await writeFile(join(home, ".pi", "agent", "settings.json"), "{invalid", "utf8");
  await writeJson(join(agentDir, "code-previews.json"), { grepCollapsedLines: 31 });

  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    const loaded = await loadSettingsFromDisk();
    assert.equal(loaded?.readCollapsedLines, 18);
    assert.equal(loaded?.grepCollapsedLines, 31);
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0]?.[0]), /Failed to load settings/);
  } finally {
    console.warn = originalWarn;
  }
});

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data)}\n`, "utf8");
}
