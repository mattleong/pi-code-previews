import type { Theme } from "@earendil-works/pi-coding-agent";
import { countLabel } from "../../shared/format";
import { positiveEnvInteger } from "../../config/env";
import { getSecretWarnings } from "../../warnings/secrets";
import { codePreviewSettings } from "../../settings/index";

const SECRET_SCAN_CHARS = positiveEnvInteger("CODE_PREVIEW_SECRET_SCAN_CHARS", 200_000);

export function withSecretWarning(source: string, theme: Theme, preview: string): string {
  if (!codePreviewSettings.secretWarnings) return preview;
  const warnings = getSecretWarnings(secretScanSample(source));
  if (warnings.length === 0) return preview;
  return `${theme.fg("warning", `⚠ Preview ${countLabel(warnings.length, "warning")}: possible ${warnings.join(", ")}`)}\n${preview}`;
}

function secretScanSample(source: string): string {
  if (source.length <= SECRET_SCAN_CHARS) return source;
  const half = Math.floor(SECRET_SCAN_CHARS / 2);
  return `${source.slice(0, half)}\n${source.slice(-half)}`;
}
