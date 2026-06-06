import { describe, expect, it, beforeEach, vi } from "vitest";
import { disposeAll, registerDisposable, resetLifecycleForTests } from "@main/bootstrap/lifecycle";

beforeEach(() => {
  resetLifecycleForTests();
});

describe("lifecycle", () => {
  it("disposes registered resources in reverse registration order", async () => {
    const order: string[] = [];
    registerDisposable({ name: "a", dispose: () => void order.push("a") });
    registerDisposable({ name: "b", dispose: () => void order.push("b") });
    registerDisposable({ name: "c", dispose: () => void order.push("c") });

    await disposeAll();

    expect(order).toEqual(["c", "b", "a"]);
  });

  it("awaits asynchronous dispose", async () => {
    let finished = false;
    registerDisposable({
      name: "slow",
      dispose: () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            finished = true;
            resolve();
          }, 10)
        ),
    });

    await disposeAll();
    expect(finished).toBe(true);
  });

  it("continues after a dispose throws", async () => {
    const order: string[] = [];
    registerDisposable({
      name: "ok",
      dispose: () => void order.push("ok"),
    });
    registerDisposable({
      name: "bad",
      dispose: () => {
        throw new Error("boom");
      },
    });

    await expect(disposeAll()).resolves.toBeUndefined();
    expect(order).toEqual(["ok"]);
  });

  it("times out individual dispose calls without hanging", async () => {
    registerDisposable({
      name: "hang",
      dispose: () =>
        new Promise<void>(() => {
          /* never resolves */
        }),
    });

    const before = Date.now();
    await disposeAll(50);
    const elapsed = Date.now() - before;
    expect(elapsed).toBeLessThan(500);
  });

  it("ignores repeated disposeAll invocations", async () => {
    const dispose = vi.fn();
    registerDisposable({ name: "x", dispose });
    await disposeAll();
    await disposeAll();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
