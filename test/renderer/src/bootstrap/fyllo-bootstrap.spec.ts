import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia } from "pinia";
import type { Router } from "vue-router";

describe("fyllo-bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("runs registered tasks", async () => {
    const { onFylloBootstrap, runBootstrapTasks } = await import("@renderer/bootstrap/core");
    const calls = new Set<string>();

    onFylloBootstrap({
      name: "first",
      phase: "critical",
      run() {
        calls.add("first");
      },
    });
    onFylloBootstrap({
      name: "second",
      phase: "critical",
      run() {
        calls.add("second");
      },
    });

    await runBootstrapTasks({
      pinia: createPinia(),
      router: {} as Router,
    });

    expect(calls).toEqual(new Set(["first", "second"]));
  });

  it("continues running remaining tasks when one task fails", async () => {
    const { onFylloBootstrap, runBootstrapTasks } = await import("@renderer/bootstrap/core");
    const calls: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    onFylloBootstrap({
      name: "failing",
      phase: "critical",
      run() {
        calls.push("failing");
        throw new Error("boom");
      },
    });
    onFylloBootstrap({
      name: "after",
      phase: "critical",
      run() {
        calls.push("after");
      },
    });

    await runBootstrapTasks({
      pinia: createPinia(),
      router: {} as Router,
    });

    expect(calls).toEqual(["failing", "after"]);
    expect(consoleError).toHaveBeenCalledWith(
      "[bootstrap] critical task failed: failing",
      expect.any(Error)
    );

    consoleError.mockRestore();
  });

  it("does not wait for one task to finish before starting another", async () => {
    const { onFylloBootstrap, runBootstrapTasks } = await import("@renderer/bootstrap/core");
    const order: string[] = [];

    onFylloBootstrap({
      name: "slow",
      phase: "critical",
      async run() {
        order.push("slow-start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push("slow-end");
      },
    });
    onFylloBootstrap({
      name: "fast",
      phase: "critical",
      run() {
        order.push("fast");
      },
    });

    await runBootstrapTasks({
      pinia: createPinia(),
      router: {} as Router,
    });

    expect(order).toContain("slow-start");
    expect(order).toContain("fast");
    expect(order.indexOf("fast")).toBeLessThan(order.indexOf("slow-end"));
  });

  it("settles all critical tasks before starting background tasks", async () => {
    const { bootstrapPhaseState, onFylloBootstrap, runBootstrapTasks } =
      await import("@renderer/bootstrap/core");
    const order: string[] = [];

    onFylloBootstrap({
      name: "workspace",
      phase: "critical",
      async run() {
        order.push("critical-start");
        await Promise.resolve();
        order.push("critical-end");
      },
    });
    onFylloBootstrap({
      name: "acp",
      phase: "background",
      run() {
        order.push("background");
      },
    });

    await runBootstrapTasks(
      { pinia: createPinia(), router: {} as Router },
      {
        onCriticalSettled() {
          order.push(`critical-${bootstrapPhaseState.critical}`);
        },
      }
    );

    expect(order).toEqual(["critical-start", "critical-end", "critical-settled", "background"]);
    expect(bootstrapPhaseState.background).toBe("settled");
  });
});
