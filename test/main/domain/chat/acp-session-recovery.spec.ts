import { describe, expect, it } from "vitest";
import { shouldSuppressDuringReplay } from "@main/domain/chat/acp-session-recovery";
import type { SessionEvent } from "@main/domain/chat/session-events";

describe("shouldSuppressDuringReplay", () => {
  it("does not suppress available_commands_update", () => {
    expect(shouldSuppressDuringReplay({ kind: "available_commands_update", commands: [] })).toBe(
      false
    );
  });

  it("does not suppress session_info_update", () => {
    expect(shouldSuppressDuringReplay({ kind: "session_info_update", title: "x" })).toBe(false);
  });

  it("does not suppress config_options_update", () => {
    expect(shouldSuppressDuringReplay({ kind: "config_options_update", options: [] })).toBe(false);
  });

  it("suppresses text_delta", () => {
    expect(shouldSuppressDuringReplay({ kind: "text_delta", text: "hi" })).toBe(true);
  });

  it("suppresses session_id_resolved", () => {
    expect(
      shouldSuppressDuringReplay({
        kind: "session_id_resolved",
        acpSessionId: "abc",
      } satisfies SessionEvent)
    ).toBe(true);
  });
});
