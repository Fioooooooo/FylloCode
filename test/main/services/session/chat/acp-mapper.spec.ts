import { describe, expect, it } from "vitest";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { mapSessionUpdate } from "@main/services/session/chat/acp-mapper";

describe("mapSessionUpdate facade", () => {
  it("maps text and generic thought chunks", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "answer" },
      } as SessionUpdate)
    ).toEqual({ kind: "text_delta", text: "answer" });

    expect(
      mapSessionUpdate({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "thinking" },
      } as SessionUpdate)
    ).toEqual({ kind: "reasoning_delta", text: "thinking" });
  });

  it("drops unsupported content and update variants", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "image", data: "abc", mimeType: "image/png" },
      } as unknown as SessionUpdate)
    ).toBeNull();
    expect(mapSessionUpdate({ sessionUpdate: "session_info_update" } as SessionUpdate)).toBeNull();
  });

  it("maps available commands without leaking structured input metadata", () => {
    const update = {
      sessionUpdate: "available_commands_update",
      availableCommands: [
        {
          name: "review",
          description: "Review changes",
          input: { hint: "optional focus", _meta: { hidden: true } },
        },
        { name: "compact", description: "Compact context", input: null },
      ],
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update)).toEqual({
      kind: "available_commands_update",
      commands: [
        { name: "review", description: "Review changes", hint: "optional focus" },
        { name: "compact", description: "Compact context", hint: undefined },
      ],
    });
  });

  it("maps plan entries and falls back for unknown enum values", () => {
    const update = {
      sessionUpdate: "plan",
      entries: [
        { content: "Inspect", priority: "high", status: "completed" },
        { content: "Unknown", priority: "urgent", status: "blocked" },
      ],
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update)).toEqual({
      kind: "agenda_update",
      entries: [
        { content: "Inspect", priority: "high", status: "completed" },
        { content: "Unknown", priority: "medium", status: "pending" },
      ],
    });
  });

  it("maps usage with the existing currency fallback", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "usage_update",
        used: 29,
        size: 100,
        cost: { amount: 0.14 },
      } as SessionUpdate)
    ).toEqual({
      kind: "usage_update",
      used: 29,
      size: 100,
      cost: { amount: 0.14, currency: "USD" },
    });
  });

  it("normalizes flat, grouped and boolean config options", () => {
    const update = {
      sessionUpdate: "config_option_update",
      configOptions: [
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: "fast",
          description: null,
          options: [{ value: "fast", name: "Fast", description: null, _meta: { hidden: true } }],
        },
        {
          id: "mode",
          name: "Mode",
          type: "select",
          currentValue: "plan",
          options: [
            {
              group: "workflow",
              name: "Workflow",
              options: [{ value: "plan", name: "Plan", description: "Think first" }],
            },
          ],
        },
        {
          id: "reasoning",
          name: "Reasoning",
          type: "boolean",
          currentValue: 1,
          category: "thought_level",
        },
      ],
    } as unknown as SessionUpdate;

    expect(mapSessionUpdate(update)).toEqual({
      kind: "config_options_update",
      options: [
        {
          id: "model",
          name: "Model",
          description: undefined,
          category: undefined,
          type: "select",
          currentValue: "fast",
          options: [{ value: "fast", name: "Fast", description: undefined }],
        },
        {
          id: "mode",
          name: "Mode",
          description: undefined,
          category: undefined,
          type: "select",
          currentValue: "plan",
          options: [
            {
              group: "workflow",
              name: "Workflow",
              options: [{ value: "plan", name: "Plan", description: "Think first" }],
            },
          ],
        },
        {
          id: "reasoning",
          name: "Reasoning",
          description: undefined,
          category: "thought_level",
          type: "boolean",
          currentValue: true,
        },
      ],
    });
  });
});
