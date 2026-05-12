import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import { getBuiltinToolOptions } from "./builtin-options";

const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;

afterEach(() => {
  if (originalPiCodingAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
});

test("builtin tool options preserve Pi shell and image settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-code-previews-tool-options-"));
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  process.env.PI_CODING_AGENT_DIR = agentDir;
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({
      shellCommandPrefix: "export PI_CODE_PREVIEW_PREFIX=ok;",
      shellPath: "/bin/sh",
      images: { autoResize: false },
    }),
    "utf8",
  );

  const options = getBuiltinToolOptions(cwd);
  assert.equal(options.bash?.commandPrefix, "export PI_CODE_PREVIEW_PREFIX=ok;");
  assert.equal(options.bash?.shellPath, "/bin/sh");
  assert.equal(options.read?.autoResizeImages, false);
});
