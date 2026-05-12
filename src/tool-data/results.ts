import { getObjectValue } from "../shared/objects";

export function isTruncated(details: unknown): boolean {
  const truncation = getObjectValue(details, "truncation");
  return getObjectValue(truncation, "truncated") === true;
}

export function getEditDiff(details: unknown): string | undefined {
  const diff = getObjectValue(details, "diff");
  return typeof diff === "string" ? diff : undefined;
}

export function getTextContent(
  content: Array<{ type: string; text?: string }> | undefined,
): string {
  return (
    content
      ?.filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n") ?? ""
  );
}
