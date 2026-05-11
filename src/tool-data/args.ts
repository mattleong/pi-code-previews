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
