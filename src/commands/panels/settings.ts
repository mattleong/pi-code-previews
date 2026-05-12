import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { SettingsList } from "@earendil-works/pi-tui";
import { codePreviewSettings, setCodePreviewSettings, updateSetting } from "../../settings/index";
import {
  flushSettingsSaveQueue,
  formatSettingsSaveError,
  queueSettingsSave,
} from "../../settings/persistence";
import { createSettingsCategoryItems, isSettingsGroupItemId } from "../../settings/ui/index";
import { initializeShiki } from "../../syntax/shiki";

interface SettingsListControllerOptions {
  notify: (message: string, level: "info" | "warning") => void;
  done: () => void;
}

export function createCodePreviewSettingsList({
  notify,
  done,
}: SettingsListControllerOptions): SettingsList {
  let list: SettingsList;
  const handleSettingChange = (id: string, value: string) => {
    if (isSettingsGroupItemId(id)) {
      syncSettingsListValues(list, handleSettingChange);
      return;
    }

    const previousTheme = codePreviewSettings.shikiTheme;
    const resetRequested = id === "resetToDefaults" && value === "reset now";
    setCodePreviewSettings(updateSetting(codePreviewSettings, id, value));
    syncSettingsListValues(list, handleSettingChange);
    if (codePreviewSettings.shikiTheme !== previousTheme)
      void initializeShiki(codePreviewSettings.shikiTheme);
    void queueSettingsSave(codePreviewSettings)
      .then(() => {
        if (resetRequested) notify("Code preview settings reset to defaults", "info");
      })
      .catch((error) => {
        notify(formatSettingsSaveError(error), "warning");
      });
  };

  const items = createSettingsCategoryItems(
    codePreviewSettings,
    () => codePreviewSettings,
    handleSettingChange,
  );
  list = new SettingsList(
    items,
    items.length + 2,
    getSettingsListTheme(),
    handleSettingChange,
    () => {
      void flushSettingsSaveQueue()
        .catch(() => undefined)
        .finally(done);
    },
  );
  return list;
}

function syncSettingsListValues(
  list: SettingsList,
  onSettingChange: (id: string, value: string) => void,
): void {
  for (const item of createSettingsCategoryItems(
    codePreviewSettings,
    () => codePreviewSettings,
    onSettingChange,
  ))
    list.updateValue(item.id, item.currentValue);
}
