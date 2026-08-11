import { describe, expect, it } from "vitest";
import type { StreamContentEvent } from "@shared/types/stream-event";

describe("StreamContentEvent tool-call contract", () => {
  it("accepts pending starts", () => {
    const event = {
      kind: "tool_call_start",
      toolCallId: "tool-1",
      title: "Run command",
      toolKind: "execute",
      status: "pending",
    } satisfies StreamContentEvent;

    expect(event.status).toBe("pending");
  });

  it("distinguishes omitted replacements from explicit empty replacements", () => {
    const omitted = {
      kind: "tool_call_update",
      toolCallId: "tool-1",
    } satisfies StreamContentEvent;
    const cleared = {
      kind: "tool_call_update",
      toolCallId: "tool-1",
      diff: [],
      locations: [],
    } satisfies StreamContentEvent;

    expect("diff" in omitted).toBe(false);
    expect("locations" in omitted).toBe(false);
    expect(cleared.diff).toEqual([]);
    expect(cleared.locations).toEqual([]);
  });
});
