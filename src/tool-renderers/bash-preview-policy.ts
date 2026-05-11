import { getObjectValue } from "../shared/objects";
import { codePreviewSettings } from "../settings/index";
import { getFirstShellCommandName } from "../shell/command";
import { shouldHideShellResultByCommand } from "../tools/shell-result-policy";

export function shouldHideBashResult(args: unknown): boolean {
  const command = getObjectValue(args, "command");
  return shouldHideShellResultByCommand(
    typeof command === "string" ? getFirstShellCommandName(command) : undefined,
    codePreviewSettings,
  );
}
