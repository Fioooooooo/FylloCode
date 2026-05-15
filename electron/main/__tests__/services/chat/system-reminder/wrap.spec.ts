import { describe, expect, it } from "vitest";
import { wrapAsSystemReminder } from "@main/domain/chat/system-reminder-wrap";

describe("wrapAsSystemReminder", () => {
  it("wraps plain content with system reminder tags", () => {
    expect(wrapAsSystemReminder("hello")).toBe("<system-reminder>\nhello\n</system-reminder>");
  });

  it("throws when the body already contains wrapper tags", () => {
    expect(() => wrapAsSystemReminder("<system-reminder>\nhello")).toThrowError(/wrapper tags/);
    expect(() => wrapAsSystemReminder("hello\n</system-reminder>")).toThrowError(/wrapper tags/);
  });
});
