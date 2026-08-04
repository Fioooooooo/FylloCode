import { describe, expect, it, vi } from "vitest";
import { createLifecycleMetrics } from "@main/bootstrap/startup-metrics";

describe("startup metrics", () => {
  it("只输出预定义阶段、耗时、结果和运行模式", () => {
    let now = 100;
    const log = vi.fn();
    const metrics = createLifecycleMetrics({
      processEntryAt: 80,
      now: () => now,
      mode: "prod",
      log,
    });

    metrics.mark("single-instance-lock");
    now = 135;
    metrics.measure("app-ready", "single-instance-lock", "failed");

    expect(log).toHaveBeenNthCalledWith(1, {
      phase: "single-instance-lock",
      durationMs: 20,
      result: "ok",
      mode: "prod",
    });
    expect(log).toHaveBeenNthCalledWith(2, {
      phase: "app-ready",
      durationMs: 35,
      result: "failed",
      mode: "prod",
    });
    const serialized = JSON.stringify(log.mock.calls);
    expect(serialized).not.toContain("path");
    expect(serialized).not.toContain("argv");
    expect(serialized).not.toContain("command");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("payload");
  });
});
