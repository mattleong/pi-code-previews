export const ON_OFF_VALUES = ["on", "off"] as const;

export type OnOffValue = (typeof ON_OFF_VALUES)[number];

export function formatOnOff(value: boolean): OnOffValue {
  return value ? "on" : "off";
}
