import { forEachRawTextLine } from "../shared/text-lines";

export function countContentLines(content: string): number {
  if (!content) return 0;
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const withoutFinalTerminator = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return withoutFinalTerminator.split("\n").length;
}

export function countPreviewTextLines(text: string): number {
  let total = 0;
  forEachPreviewTextLine(text, () => {
    total++;
  });
  return total;
}

export function forEachPreviewTextLine(
  text: string,
  callback: (line: string, index: number) => void,
): void {
  let index = 0;
  let pendingEmpty = 0;
  forEachRawTextLine(text, (line) => {
    if (line === "") {
      pendingEmpty++;
      return;
    }
    while (pendingEmpty > 0) {
      callback("", index++);
      pendingEmpty--;
    }
    callback(line, index++);
  });
  if (index === 0 && pendingEmpty > 0 && text.length > 0) callback("", index);
}
