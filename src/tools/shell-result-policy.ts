export interface ShellResultPreviewSettings {
  bashResultPreview: boolean;
  grepResultPreview: boolean;
  findResultPreview: boolean;
  lsResultPreview: boolean;
}

const SHELL_RESULT_PREVIEW_SETTINGS = [
  {
    commands: new Set(["grep", "egrep", "fgrep"]),
    setting: "grepResultPreview",
  },
  { commands: new Set(["find"]), setting: "findResultPreview" },
  { commands: new Set(["ls"]), setting: "lsResultPreview" },
] as const;

export function requiresBashResultPolicy(settings: ShellResultPreviewSettings): boolean {
  return (
    !settings.bashResultPreview ||
    SHELL_RESULT_PREVIEW_SETTINGS.some(({ setting }) => !settings[setting])
  );
}

export function shouldHideShellResultByCommand(
  shellCommand: string | undefined,
  settings: ShellResultPreviewSettings,
): boolean {
  if (!settings.bashResultPreview) return true;
  if (!shellCommand) return false;
  const policy = SHELL_RESULT_PREVIEW_SETTINGS.find(({ commands }) => commands.has(shellCommand));
  return policy ? !settings[policy.setting] : false;
}
