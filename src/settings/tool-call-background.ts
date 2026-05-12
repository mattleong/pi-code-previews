import { TOOL_CALL_BACKGROUND_MODES, type ToolCallBackgroundMode } from "./types";

export function parseToolCallBackgroundMode(value: unknown): ToolCallBackgroundMode | undefined {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value !== "string") return undefined;

  const normalized = value.toLowerCase();
  if (isToolCallBackgroundMode(normalized)) return normalized;
  if (normalized === "1" || normalized === "true" || normalized === "yes") return "on";
  if (normalized === "0" || normalized === "false" || normalized === "no") return "off";
  return undefined;
}

export function isToolCallBackgroundMode(value: unknown): value is ToolCallBackgroundMode {
  return (
    typeof value === "string" && (TOOL_CALL_BACKGROUND_MODES as readonly string[]).includes(value)
  );
}
