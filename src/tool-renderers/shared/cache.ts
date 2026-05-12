import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { AsyncPreview, shouldRenderAsync } from "../../preview/async";

export function cachedPreview(
  state: Record<string, unknown>,
  keyName: string,
  componentName: string,
  key: string,
  create: () => Component,
): Component {
  const cached = state[componentName];
  if (state[keyName] !== key || !cached || typeof (cached as Component).render !== "function") {
    state[keyName] = key;
    state[componentName] = create();
  }
  return state[componentName] as Component;
}

export function cachedAsyncPreview(
  state: Record<string, unknown>,
  keyName: string,
  componentName: string,
  key: string,
  source: string,
  loadingLabel: string,
  theme: Theme,
  render: () => Component,
  invalidate: () => void,
): Component {
  return cachedPreview(state, keyName, componentName, key, () =>
    shouldRenderAsync(source)
      ? new AsyncPreview(loadingLabel, theme, render, invalidate)
      : render(),
  );
}
