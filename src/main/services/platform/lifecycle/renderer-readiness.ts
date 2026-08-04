import type { WebContents } from "electron";
import { markLifecycleMetric } from "@main/bootstrap/startup-metrics";

export const RENDERER_INTERACTIVE_FALLBACK_MS = 1_500;

interface RendererReadinessDependencies {
  getFormalGeneration(webContents: WebContents): number | null;
  scheduleInitialWarmup(): void;
  fallbackMs?: number;
}

interface PendingFallback {
  generation: number;
  timer: ReturnType<typeof setTimeout>;
}

let dependencies: RendererReadinessDependencies | null = null;
let initialWarmupScheduled = false;
const pendingFallbacks = new Map<number, PendingFallback>();

export function configureRendererReadiness(next: RendererReadinessDependencies): void {
  dependencies = next;
}

function scheduleWarmup(): void {
  if (initialWarmupScheduled || !dependencies) return;
  initialWarmupScheduled = true;
  dependencies.scheduleInitialWarmup();
  markLifecycleMetric("warmup-scheduled");
}

export function markRendererInteractive(webContents: WebContents): boolean {
  if (!dependencies) return false;
  const generation = dependencies.getFormalGeneration(webContents);
  if (generation === null) return false;

  cancelRendererInteractiveFallback(webContents);
  markLifecycleMetric("renderer-interactive");
  scheduleWarmup();
  return true;
}

export function beginRendererInteractiveFallback(
  webContents: WebContents,
  generation: number
): boolean {
  if (
    !dependencies ||
    initialWarmupScheduled ||
    dependencies.getFormalGeneration(webContents) !== generation
  ) {
    return false;
  }

  cancelRendererInteractiveFallback(webContents);
  const timer = setTimeout(() => {
    const pending = pendingFallbacks.get(webContents.id);
    if (
      pending?.generation === generation &&
      dependencies?.getFormalGeneration(webContents) === generation
    ) {
      pendingFallbacks.delete(webContents.id);
      scheduleWarmup();
    }
  }, dependencies.fallbackMs ?? RENDERER_INTERACTIVE_FALLBACK_MS);
  pendingFallbacks.set(webContents.id, { generation, timer });
  return true;
}

export function cancelRendererInteractiveFallback(webContents?: WebContents): void {
  if (webContents) {
    const pending = pendingFallbacks.get(webContents.id);
    if (pending) clearTimeout(pending.timer);
    pendingFallbacks.delete(webContents.id);
    return;
  }

  for (const pending of pendingFallbacks.values()) clearTimeout(pending.timer);
  pendingFallbacks.clear();
}

export function resetRendererReadinessForTests(): void {
  cancelRendererInteractiveFallback();
  dependencies = null;
  initialWarmupScheduled = false;
}
