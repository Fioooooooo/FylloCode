import { readFileSync } from "fs";
import { join } from "path";
import type { Rectangle } from "electron";
import { getDataSubPath } from "@main/infra/paths";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";

export interface MainWindowState {
  bounds: Rectangle;
  isMaximized: boolean;
}

export type WindowStateKey = { role: "launcher" } | { role: "project"; projectId: string };

function mainWindowStateDir(): string {
  return getDataSubPath("window-state");
}

function mainWindowStatePath(): string {
  return join(mainWindowStateDir(), "main-window.json");
}

function windowStatePath(key: WindowStateKey): string {
  if (key.role === "launcher") {
    return join(mainWindowStateDir(), "launcher.json");
  }

  return join(mainWindowStateDir(), "projects", `${key.projectId}.json`);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== "object") return false;

  const rect = value as Partial<Rectangle>;

  return (
    isFiniteNumber(rect.x) &&
    isFiniteNumber(rect.y) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function isValidMainWindowState(value: unknown): value is MainWindowState {
  if (!value || typeof value !== "object") return false;

  const state = value as Partial<MainWindowState>;
  return typeof state.isMaximized === "boolean" && isValidRectangle(state.bounds);
}

export function loadMainWindowState(): MainWindowState | null {
  return readWindowStateFile(mainWindowStatePath());
}

function readWindowStateFile(filePath: string): MainWindowState | null {
  try {
    const content = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return isValidMainWindowState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMainWindowState(state: MainWindowState): void {
  writeFileAtomicSync(mainWindowStatePath(), JSON.stringify(state, null, 2));
}

export function loadWindowState(key: WindowStateKey): MainWindowState | null {
  const state = readWindowStateFile(windowStatePath(key));

  if (state || key.role !== "launcher") {
    return state;
  }

  return loadMainWindowState();
}

export function saveWindowState(key: WindowStateKey, state: MainWindowState): void {
  writeFileAtomicSync(windowStatePath(key), JSON.stringify(state, null, 2));
}
