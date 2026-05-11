export function forEachRawTextLine(text: string, callback: (line: string) => false | void): void {
  let start = 0;
  while (start <= text.length) {
    const newline = text.indexOf("\n", start);
    if (newline < 0) {
      callback(text.slice(start));
      break;
    }
    if (callback(text.slice(start, newline)) === false) break;
    start = newline + 1;
  }
}

export function splitLinesLimited(text: string, limit: number): string[] {
  const max = Math.max(0, Math.floor(limit));
  if (Number.isNaN(max) || max <= 0) return [];
  const lines: string[] = [];
  forEachRawTextLine(text, (line) => {
    lines.push(line);
    if (lines.length >= max) return false;
  });
  return lines;
}
