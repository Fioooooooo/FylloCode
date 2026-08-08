import type { Component } from "vue";
import type { FylloSignalType } from "@shared/fyllo-signal/protocol";
import ShowTimeSignal from "./signals/ShowTimeSignal.vue";
import SpawnSessionSignal from "./signals/SpawnSessionSignal.vue";

export type RendererSignalComponentMap = Record<FylloSignalType, Component>;

export const rendererSignalComponents = {
  "show.time": ShowTimeSignal,
  "spawn.session": SpawnSessionSignal,
} satisfies RendererSignalComponentMap;

export function getRendererSignalComponent(
  type: FylloSignalType
): RendererSignalComponentMap[FylloSignalType] {
  const component = rendererSignalComponents[type];
  if (!component) {
    throw new Error(`Missing Fyllo signal renderer component: ${type}`);
  }
  return component;
}
