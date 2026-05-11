import { getObjectValue } from "../../shared/objects";
import { codePreviewSettings } from "../../settings/index";

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

function getFirstShellCommandName(command: string): string | undefined {
  const words = getLeadingShellWords(command);
  const commandWord = words.find((word) => !isShellAssignment(word));
  return commandWord?.split("/").pop();
}

function getLeadingShellWords(command: string): string[] {
  const words: string[] = [];
  let index = 0;
  while (index < command.length) {
    while (index < command.length && /\s/.test(command[index]!)) index++;
    if (index >= command.length || isShellOperator(command[index]!)) break;

    let word = "";
    while (index < command.length) {
      const char = command[index]!;
      if (/\s/.test(char) || isShellOperator(char)) break;
      if (char === "'" || char === '"') {
        const quote = char;
        index++;
        while (index < command.length && command[index] !== quote) {
          if (quote === '"' && command[index] === "\\") index++;
          if (index < command.length) word += command[index++]!;
        }
        if (index < command.length) index++;
        continue;
      }
      if (char === "\\") {
        index++;
        if (index < command.length) word += command[index++]!;
        continue;
      }
      word += char;
      index++;
    }
    if (word) words.push(word);
    if (words.length >= 8) break;
  }
  return words;
}

function isShellAssignment(word: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(word);
}

function isShellOperator(char: string): boolean {
  return "|&;()<>{}".includes(char);
}
