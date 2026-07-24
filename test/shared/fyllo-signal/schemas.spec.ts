import { describe, expect, it } from "vitest";
import { showTimeSignalPayloadSchema } from "@shared/fyllo-signal/schemas";

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
