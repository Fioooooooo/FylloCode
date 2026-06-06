import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Rectangle } from "electron";
import { getDataSubPath } from "@main/infra/paths";

export interface MainWindowState {
  bounds: Rectangle;
  isMaximized: boolean;
}

function mainWindowStateDir(): string {
  return getDataSubPath("window-state");
}

function mainWindowStatePath(): string {
  return join(mainWindowStateDir(), "main-window.json");
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
  try {
    const content = readFileSync(mainWindowStatePath(), "utf8");
    const parsed = JSON.parse(content) as unknown;
    return isValidMainWindowState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMainWindowState(state: MainWindowState): void {
  mkdirSync(mainWindowStateDir(), { recursive: true });
  writeFileSync(mainWindowStatePath(), JSON.stringify(state, null, 2), "utf8");
}
