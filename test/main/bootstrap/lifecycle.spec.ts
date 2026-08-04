import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  beginShutdown,
  isShuttingDown,
  resetLifecycleForTests,
  runLifecyclePhases,
} from "@main/bootstrap/lifecycle";

beforeEach(() => {
  resetLifecycleForTests();
});

describe("lifecycle", () => {
  it("runs phases in order and tasks within a phase concurrently", async () => {
    const order: string[] = [];
    const onPhaseSettled = vi.fn();
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const resultPromise = runLifecyclePhases(
      [
        {
          name: "quiesce",
          tasks: [
            {
              name: "slow",
              async run() {
                order.push("slow-start");
                await slow;
                order.push("slow-end");
              },
            },
            { name: "fast", run: () => void order.push("fast") },
          ],
        },
        { name: "terminate", tasks: [{ name: "last", run: () => void order.push("last") }] },
      ],
      { deadlineMs: 1_000, forceReserveMs: 100, onPhaseSettled }
    );

    await vi.waitFor(() => expect(order).toEqual(["slow-start", "fast"]));
    releaseSlow();
    const result = await resultPromise;

    expect(order).toEqual(["slow-start", "fast", "slow-end", "last"]);
    expect(result.deadlineReached).toBe(false);
    expect(onPhaseSettled.mock.calls).toEqual([
      ["quiesce", "fulfilled"],
      ["terminate", "fulfilled"],
    ]);
  });

  it("uses one deadline and invokes force hooks for pending tasks", async () => {
    vi.useFakeTimers();
    const onPhaseSettled = vi.fn();
    const force = vi.fn(() => new Promise<void>(() => undefined));
    const resultPromise = runLifecyclePhases(
      [
        {
          name: "terminate",
          tasks: [
            {
              name: "hung",
              run: () => new Promise<void>(() => undefined),
              force,
            },
          ],
        },
      ],
      { deadlineMs: 100, forceReserveMs: 20, onPhaseSettled }
    );

    await vi.advanceTimersByTimeAsync(80);
    expect(force).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.deadlineReached).toBe(true);
    expect(result.pendingTasks).toEqual(["hung"]);
    expect(onPhaseSettled).toHaveBeenCalledWith("terminate", "pending");
    vi.useRealTimers();
  });

  it("does not let a rejected force hook escape or extend the deadline", async () => {
    vi.useFakeTimers();
    const resultPromise = runLifecyclePhases(
      [
        {
          name: "terminate",
          tasks: [
            {
              name: "hung",
              run: () => new Promise<void>(() => undefined),
              force: () => Promise.reject(new Error("force failed")),
            },
          ],
        },
      ],
      { deadlineMs: 100, forceReserveMs: 20 }
    );

    await vi.advanceTimersByTimeAsync(80);
    await expect(resultPromise).resolves.toMatchObject({
      deadlineReached: true,
      pendingTasks: ["hung"],
    });
    vi.useRealTimers();
  });

  it("forces not-yet-started terminate tasks when an earlier phase consumes the budget", async () => {
    vi.useFakeTimers();
    const terminate = vi.fn();
    const force = vi.fn();
    const resultPromise = runLifecyclePhases(
      [
        {
          name: "quiesce",
          tasks: [{ name: "hung", run: () => new Promise<void>(() => undefined) }],
        },
        {
          name: "terminate",
          tasks: [{ name: "child-process", run: terminate, force }],
        },
      ],
      { deadlineMs: 100, forceReserveMs: 20 }
    );

    await vi.advanceTimersByTimeAsync(80);
    expect(terminate).not.toHaveBeenCalled();
    expect(force).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;
    expect(result.pendingTasks).toContain("child-process");
    vi.useRealTimers();
  });

  it("sets the shutdown fence only once", () => {
    expect(beginShutdown()).toBe(true);
    expect(beginShutdown()).toBe(false);
    expect(isShuttingDown()).toBe(true);
  });
});
