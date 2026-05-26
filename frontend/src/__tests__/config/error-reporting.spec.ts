import { createApp } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installErrorReporting, serializeErrorReason } from "@renderer/config/error-reporting";

const mocks = vi.hoisted(() => ({
  reportRendererError: vi.fn(() => Promise.resolve({ ok: true, data: undefined })),
}));

vi.mock("@renderer/api/app", () => ({
  appApi: {
    reportRendererError: mocks.reportRendererError,
  },
}));

describe("renderer error reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes Error instances into IPC-safe fields", () => {
    const error = new TypeError("Broken renderer state");
    error.stack = "TypeError: Broken renderer state";

    expect(serializeErrorReason(error)).toEqual({
      message: "Broken renderer state",
      name: "TypeError",
      stack: "TypeError: Broken renderer state",
    });
  });

  it("serializes non-Error rejection reasons", () => {
    expect(serializeErrorReason({ code: "FAILED", message: "Nope" })).toEqual({
      message: '{"code":"FAILED","message":"Nope"}',
    });
  });

  it("reports Vue global errors with route and component info", async () => {
    const app = createApp({});
    installErrorReporting(app, { getRoute: () => "/task" });

    app.config.errorHandler?.(new Error("Vue exploded"), null, "component event handler");
    await Promise.resolve();

    expect(mocks.reportRendererError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "vue",
        message: "Vue exploded",
        name: "Error",
        info: "component event handler",
        route: "/task",
      })
    );
  });
});
