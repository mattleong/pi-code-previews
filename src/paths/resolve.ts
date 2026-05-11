import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

export function resolvePreviewPath(path: string, cwd: string): string {
  let expanded = path.startsWith("@") ? path.slice(1) : path;
  expanded = expanded.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  if (expanded === "~") expanded = homedir();
  else if (expanded.startsWith("~/")) expanded = `${homedir()}${expanded.slice(1)}`;
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}
