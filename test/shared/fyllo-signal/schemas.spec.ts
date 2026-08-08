import { describe, expect, it } from "vitest";
import {
  showTimeSignalPayloadSchema,
  spawnSessionSignalPayloadSchema,
} from "@shared/fyllo-signal/schemas";

describe("showTimeSignalPayloadSchema", () => {
  it("accepts a single-line label", () => {
    expect(showTimeSignalPayloadSchema.parse({ label: "2026-07-24 10:30" })).toEqual({
      label: "2026-07-24 10:30",
    });
  });

  it.each(["", "first\nsecond", "first\rsecond", "x".repeat(201)])(
    "rejects an invalid label",
    (label) => {
      expect(showTimeSignalPayloadSchema.safeParse({ label }).success).toBe(false);
    }
  );

  it("rejects extra fields", () => {
    expect(
      showTimeSignalPayloadSchema.safeParse({ label: "2026-07-24", timezone: "Asia/Shanghai" })
        .success
    ).toBe(false);
  });
});

describe("spawnSessionSignalPayloadSchema", () => {
  it("accepts only an opaque Session identity", () => {
    expect(spawnSessionSignalPayloadSchema.parse({ sessionId: "spawn-1" })).toEqual({
      sessionId: "spawn-1",
    });
  });

  it.each(["", "a/b", "a\\b", "a\0b", "x".repeat(257)])(
    "rejects an invalid Session identity",
    (sessionId) => {
      expect(spawnSessionSignalPayloadSchema.safeParse({ sessionId }).success).toBe(false);
    }
  );

  it("rejects untrusted display and owner fields", () => {
    expect(
      spawnSessionSignalPayloadSchema.safeParse({ sessionId: "spawn-1", agentId: "fake" }).success
    ).toBe(false);
  });
});
