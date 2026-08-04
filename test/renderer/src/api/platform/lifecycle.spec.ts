import { beforeEach, describe, expect, it, vi } from "vitest";

describe("renderer lifecycleApi", () => {
  const markInteractive = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.api = {
      platform: { lifecycle: { markInteractive } },
    } as unknown as Window["api"];
  });

  it("delegates interactive readiness to preload", async () => {
    const { lifecycleApi } = await import("@renderer/api/platform/lifecycle");

    lifecycleApi.markInteractive();

    expect(markInteractive).toHaveBeenCalledOnce();
  });
});
