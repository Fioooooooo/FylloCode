import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import {
  applySessionConfigOverrides,
  recoverSessionConfig,
} from "@main/services/session/chat/session-config-recovery-service";

const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@main/infra/logger", () => ({
  default: mocks.logger,
}));

function select(
  id: string,
  currentValue: string,
  values: string[] = ["default", "saved"]
): AcpSessionConfigOption {
  return {
    id,
    name: id,
    type: "select",
    currentValue,
    options: values.map((value) => ({ value, name: value })),
  };
}

function connection(setSessionConfigOption = vi.fn()) {
  return {
    setSessionConfigOption,
  } as never;
}

describe("session-config-recovery-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serially restores options in persisted order using each full response", async () => {
    const setSessionConfigOption = vi
      .fn()
      .mockResolvedValueOnce({
        configOptions: [
          select("model", "saved"),
          select("thought", "default", ["default", "deep"]),
        ],
      })
      .mockResolvedValueOnce({
        configOptions: [select("model", "saved"), select("thought", "deep", ["default", "deep"])],
      });

    const result = await recoverSessionConfig({
      connection: connection(setSessionConfigOption),
      sessionId: "acp-1",
      persistedOptions: [select("model", "saved"), select("thought", "deep", ["default", "deep"])],
      liveOptions: [select("model", "default"), select("thought", "default")],
    });

    expect(setSessionConfigOption.mock.calls).toEqual([
      [{ sessionId: "acp-1", configId: "model", value: "saved" }],
      [{ sessionId: "acp-1", configId: "thought", value: "deep" }],
    ]);
    expect(result.map(({ id, currentValue }) => ({ id, currentValue }))).toEqual([
      { id: "model", currentValue: "saved" },
      { id: "thought", currentValue: "deep" },
    ]);
  });

  it("does not send redundant set requests when the live snapshot matches", async () => {
    const setSessionConfigOption = vi.fn();
    const live = [select("model", "saved")];

    await expect(
      recoverSessionConfig({
        connection: connection(setSessionConfigOption),
        sessionId: "acp-1",
        persistedOptions: [select("model", "saved")],
        liveOptions: live,
      })
    ).resolves.toEqual(live);
    expect(setSessionConfigOption).not.toHaveBeenCalled();
  });

  it("forces confirmation from persisted schema when lifecycle options are missing", async () => {
    const setSessionConfigOption = vi.fn().mockResolvedValue({
      configOptions: [select("model", "saved")],
    });

    await expect(
      recoverSessionConfig({
        connection: connection(setSessionConfigOption),
        sessionId: "acp-1",
        persistedOptions: [select("model", "saved")],
        liveOptions: undefined,
      })
    ).resolves.toEqual([select("model", "saved")]);
    expect(setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "acp-1",
      configId: "model",
      value: "saved",
    });
  });

  it("skips incompatible options, logs warnings, and restores compatible options", async () => {
    const setSessionConfigOption = vi.fn().mockResolvedValue({
      configOptions: [select("compatible", "saved"), select("invalid", "default", ["default"])],
    });

    const result = await recoverSessionConfig({
      connection: connection(setSessionConfigOption),
      sessionId: "acp-1",
      persistedOptions: [
        select("removed", "saved"),
        select("compatible", "saved"),
        select("invalid", "saved"),
      ],
      liveOptions: [select("compatible", "default"), select("invalid", "default", ["default"])],
    });

    expect(setSessionConfigOption).toHaveBeenCalledOnce();
    expect(setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "acp-1",
      configId: "compatible",
      value: "saved",
    });
    expect(result).toEqual([
      select("compatible", "saved"),
      select("invalid", "default", ["default"]),
    ]);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "[chat.config-recovery] incompatible persisted option",
      expect.objectContaining({ sessionId: "acp-1", configId: "removed", reason: "removed" })
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "[chat.config-recovery] incompatible persisted option",
      expect.objectContaining({ sessionId: "acp-1", configId: "invalid", reason: "invalid_value" })
    );
  });

  it("rejects without returning an unconfirmed snapshot when an RPC fails", async () => {
    const failure = new Error("transport closed");

    await expect(
      recoverSessionConfig({
        connection: connection(vi.fn().mockRejectedValue(failure)),
        sessionId: "acp-1",
        persistedOptions: [select("model", "saved")],
        liveOptions: [select("model", "default")],
      })
    ).rejects.toBe(failure);
  });

  it("rejects repeated live snapshots that still need recovery", async () => {
    const unchanged = [select("model", "default")];

    await expect(
      recoverSessionConfig({
        connection: connection(
          vi.fn().mockResolvedValue({
            configOptions: unchanged,
          })
        ),
        sessionId: "acp-1",
        persistedOptions: [select("model", "saved")],
        liveOptions: unchanged,
      })
    ).rejects.toThrow("did not converge");
  });

  it("按请求顺序应用 spawn overrides，并使用每次返回的完整 schema", async () => {
    const setSessionConfigOption = vi
      .fn()
      .mockResolvedValueOnce({
        configOptions: [
          select("model", "saved"),
          select("thought", "default", ["default", "deep"]),
        ],
      })
      .mockResolvedValueOnce({
        configOptions: [select("model", "saved"), select("thought", "deep", ["default", "deep"])],
      });

    const result = await applySessionConfigOverrides({
      connection: connection(setSessionConfigOption),
      sessionId: "acp-1",
      liveOptions: [select("model", "default"), select("thought", "default", ["default", "deep"])],
      overrides: { model: "saved", thought: "deep" },
    });

    expect(setSessionConfigOption.mock.calls).toEqual([
      [{ sessionId: "acp-1", configId: "model", value: "saved" }],
      [{ sessionId: "acp-1", configId: "thought", value: "deep" }],
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("拒绝未知或类型不兼容的 override，set-option 失败则逐项返回 warning", async () => {
    await expect(
      applySessionConfigOverrides({
        connection: connection(),
        sessionId: "acp-1",
        liveOptions: [select("model", "default")],
        overrides: { missing: "saved" },
      })
    ).rejects.toMatchObject({ code: "SPAWN_INVALID_REQUEST" });

    const result = await applySessionConfigOverrides({
      connection: connection(vi.fn().mockRejectedValue(new Error("unsupported now"))),
      sessionId: "acp-1",
      liveOptions: [select("model", "default")],
      overrides: { model: "saved" },
    });
    expect(result).toMatchObject({
      warnings: [{ optionId: "model", message: "unsupported now" }],
    });
  });
});
