import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";
import {
  beginRendererInteractiveFallback,
  cancelRendererInteractiveFallback,
  configureRendererReadiness,
  markRendererInteractive,
  resetRendererReadinessForTests,
} from "@main/services/platform/lifecycle/renderer-readiness";

const webContents = { id: 42 } as WebContents;

describe("renderer readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRendererReadinessForTests();
  });

  it("accepts only an active formal renderer and schedules warmup once", () => {
    const scheduleInitialWarmup = vi.fn();
    configureRendererReadiness({
      getFormalGeneration: (candidate) => (candidate === webContents ? 7 : null),
      scheduleInitialWarmup,
      fallbackMs: 50,
    });

    expect(markRendererInteractive({ id: 99 } as WebContents)).toBe(false);
    expect(markRendererInteractive(webContents)).toBe(true);
    expect(markRendererInteractive(webContents)).toBe(true);
    expect(scheduleInitialWarmup).toHaveBeenCalledOnce();
  });

  it("uses the formal load fallback and cancels it on navigation or shutdown", async () => {
    const scheduleInitialWarmup = vi.fn();
    configureRendererReadiness({
      getFormalGeneration: () => 7,
      scheduleInitialWarmup,
      fallbackMs: 50,
    });

    expect(beginRendererInteractiveFallback(webContents, 7)).toBe(true);
    await vi.advanceTimersByTimeAsync(49);
    expect(scheduleInitialWarmup).not.toHaveBeenCalled();
    cancelRendererInteractiveFallback(webContents);
    await vi.advanceTimersByTimeAsync(1);
    expect(scheduleInitialWarmup).not.toHaveBeenCalled();

    beginRendererInteractiveFallback(webContents, 7);
    await vi.advanceTimersByTimeAsync(50);
    expect(scheduleInitialWarmup).toHaveBeenCalledOnce();
  });
});
