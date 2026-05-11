import { getObjectValue } from "../shared/objects";
import { codePreviewSettings } from "../settings/index";
import { getFirstShellCommandName } from "../shell/command";

export function shouldHideBashResult(args: unknown): boolean {
  if (!codePreviewSettings.bashResultPreview) return true;
  const command = getObjectValue(args, "command");
  if (typeof command !== "string") return false;
  const shellCommand = getFirstShellCommandName(command);
  if (
    (shellCommand === "grep" || shellCommand === "egrep" || shellCommand === "fgrep") &&
    !codePreviewSettings.grepResultPreview
  )
    return true;
  if (shellCommand === "find" && !codePreviewSettings.findResultPreview) return true;
  if (shellCommand === "ls" && !codePreviewSettings.lsResultPreview) return true;
  return false;
}
