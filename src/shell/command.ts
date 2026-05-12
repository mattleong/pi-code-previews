export function getFirstShellCommandName(command: string): string | undefined {
  const words = getLeadingShellWords(command);
  const commandWord = words.find((word) => !isShellAssignment(word));
  return commandWord?.split("/").pop();
}

export function normalizeShellCommandWhitespace(command: string): string {
  return command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
}

function getLeadingShellWords(command: string): string[] {
  const words: string[] = [];
  let index = 0;
  while (index < command.length) {
    while (index < command.length && /\s/.test(command.charAt(index))) index++;
    if (index >= command.length || isShellOperator(command.charAt(index))) break;

    let word = "";
    while (index < command.length) {
      const char = command.charAt(index);
      if (/\s/.test(char) || isShellOperator(char)) break;
      if (char === "'" || char === '"') {
        const quote = char;
        index++;
        while (index < command.length && command.charAt(index) !== quote) {
          if (quote === '"' && command.charAt(index) === "\\") index++;
          if (index < command.length) {
            word += command.charAt(index);
            index++;
          }
        }
        if (index < command.length) index++;
        continue;
      }
      if (char === "\\") {
        index++;
        if (index < command.length) {
          word += command.charAt(index);
          index++;
        }
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
