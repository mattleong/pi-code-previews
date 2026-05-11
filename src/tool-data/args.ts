import { getObjectValue } from "../shared/objects";

export function getPathArg(args: unknown): string {
  const path = getObjectValue(args, "path") ?? getObjectValue(args, "file_path");
  return typeof path === "string" ? path : "";
}

export function getReadStartLine(args: unknown): number {
  const offset = getObjectValue(args, "offset");
  return typeof offset === "number" && Number.isFinite(offset) && offset > 0
    ? Math.floor(offset)
    : 1;
}

export interface EditPreviewOperation {
  oldText: string;
  newText: string;
}

export function getEditPreviewOperations(args: unknown): EditPreviewOperation[] {
  const edits = getObjectValue(args, "edits");
  if (Array.isArray(edits)) {
    return edits.flatMap((edit) => {
      const oldText = getObjectValue(edit, "oldText") ?? getObjectValue(edit, "old_text");
      const newText = getObjectValue(edit, "newText") ?? getObjectValue(edit, "new_text");
      return typeof oldText === "string" && typeof newText === "string" && oldText !== newText
        ? [{ oldText, newText }]
        : [];
    });
  }
  const oldText = getObjectValue(args, "oldText") ?? getObjectValue(args, "old_text");
  const newText = getObjectValue(args, "newText") ?? getObjectValue(args, "new_text");
  return typeof oldText === "string" && typeof newText === "string" && oldText !== newText
    ? [{ oldText, newText }]
    : [];
}
