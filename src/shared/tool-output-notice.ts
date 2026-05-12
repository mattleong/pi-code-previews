export function isToolOutputNoticeLine(line: string): boolean {
  return line.startsWith("[") && line.endsWith("]");
}
