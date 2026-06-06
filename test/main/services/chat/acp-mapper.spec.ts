import { describe, expect, it } from "vitest";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { mapSessionUpdate } from "@main/services/chat/acp-mapper";

describe("mapSessionUpdate", () => {
  describe("agent_thought_chunk", () => {
    it("maps text content to reasoning_delta", () => {
      const update = {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "text",
          text: "thinking",
        },
      } as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        type: "reasoning_delta",
        text: "thinking",
      });
    });

    it("returns null for non-text content", () => {
      const update = {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "image",
        },
      } as SessionUpdate;

      expect(mapSessionUpdate(update)).toBeNull();
    });
  });

  describe("available_commands_update", () => {
    it("keeps only name, description and unstructured hint", () => {
      const update = {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: "review",
            description: "Review code",
            input: {
              type: "unstructured",
              hint: "commit sha",
            },
            _meta: { ignored: true },
          },
        ],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        type: "available_commands_update",
        commands: [
          {
            name: "review",
            description: "Review code",
            hint: "commit sha",
          },
        ],
      });
    });

    it("omits hint when input is null or absent", () => {
      const update = {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: "review",
            description: "Review code",
            input: null,
          },
          {
            name: "plan",
            description: "Create plan",
          },
        ],
      } as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        type: "available_commands_update",
        commands: [
          {
            name: "review",
            description: "Review code",
            hint: undefined,
          },
          {
            name: "plan",
            description: "Create plan",
            hint: undefined,
          },
        ],
      });
    });

    it("keeps empty command arrays", () => {
      const update = {
        sessionUpdate: "available_commands_update",
        availableCommands: [],
      } as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        type: "available_commands_update",
        commands: [],
      });
    });
  });

  describe("plan", () => {
    it("maps entries to plan_update keeping only content/priority/status", () => {
      const update = {
        sessionUpdate: "plan",
        entries: [
          {
            content: "分析现有代码结构",
            priority: "high",
            status: "completed",
            _meta: { ignored: true },
          },
          { content: "编写单元测试", priority: "medium", status: "in_progress" },
          { content: "提交 PR", priority: "low", status: "pending" },
        ],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        type: "plan_update",
        entries: [
          { content: "分析现有代码结构", priority: "high", status: "completed" },
          { content: "编写单元测试", priority: "medium", status: "in_progress" },
          { content: "提交 PR", priority: "low", status: "pending" },
        ],
      });
    });

    it("keeps empty entry arrays", () => {
      const update = {
        sessionUpdate: "plan",
        entries: [],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        type: "plan_update",
        entries: [],
      });
    });

    it("falls back to medium/pending for unrecognized priority/status", () => {
      const update = {
        sessionUpdate: "plan",
        entries: [{ content: "未知字段", priority: "urgent", status: "blocked" }],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        type: "plan_update",
        entries: [{ content: "未知字段", priority: "medium", status: "pending" }],
      });
    });
  });

  it("maps usage_update events", () => {
    const update = {
      sessionUpdate: "usage_update",
      used: 29017,
      size: 1000000,
      cost: { amount: 0.145305, currency: "USD" },
    } as SessionUpdate;

    expect(mapSessionUpdate(update)).toEqual({
      type: "usage_update",
      used: 29017,
      size: 1000000,
      cost: { amount: 0.145305, currency: "USD" },
    });
  });

  it("omits absent usage_update cost", () => {
    const update = {
      sessionUpdate: "usage_update",
      used: 29017,
      size: 1000000,
    } as SessionUpdate;

    expect(mapSessionUpdate(update)).toEqual({
      type: "usage_update",
      used: 29017,
      size: 1000000,
      cost: undefined,
    });
  });

  describe("config_option_update", () => {
    it("maps a flat select option, stripping _meta and normalizing nulls", () => {
      const update = {
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            type: "select",
            id: "model",
            name: "Model",
            description: null,
            category: null,
            currentValue: "sonnet",
            options: [
              { value: "sonnet", name: "Sonnet", description: null, _meta: { x: 1 } },
              { value: "haiku", name: "Haiku" },
            ],
            _meta: { foo: "bar" },
          },
        ],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        type: "config_options_update",
        options: [
          {
            type: "select",
            id: "model",
            name: "Model",
            description: undefined,
            category: undefined,
            currentValue: "sonnet",
            options: [
              { value: "sonnet", name: "Sonnet", description: undefined },
              { value: "haiku", name: "Haiku", description: undefined },
            ],
          },
        ],
      });
    });

    it("preserves grouped select options", () => {
      const update = {
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            type: "select",
            id: "model",
            name: "Model",
            currentValue: "sonnet-4",
            category: "model",
            options: [
              {
                group: "anthropic",
                name: "Anthropic",
                options: [
                  { value: "sonnet-4", name: "Sonnet 4" },
                  { value: "haiku-4", name: "Haiku 4" },
                ],
              },
              {
                group: "openai",
                name: "OpenAI",
                options: [{ value: "gpt-5", name: "GPT-5" }],
                _meta: { x: 1 },
              },
            ],
          },
        ],
      } as unknown as SessionUpdate;

      const event = mapSessionUpdate(update);
      expect(event).toEqual({
        type: "config_options_update",
        options: [
          {
            type: "select",
            id: "model",
            name: "Model",
            description: undefined,
            category: "model",
            currentValue: "sonnet-4",
            options: [
              {
                group: "anthropic",
                name: "Anthropic",
                options: [
                  { value: "sonnet-4", name: "Sonnet 4", description: undefined },
                  { value: "haiku-4", name: "Haiku 4", description: undefined },
                ],
              },
              {
                group: "openai",
                name: "OpenAI",
                options: [{ value: "gpt-5", name: "GPT-5", description: undefined }],
              },
            ],
          },
        ],
      });
    });

    it("maps boolean options with categories", () => {
      const update = {
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            type: "boolean",
            id: "stream",
            name: "Stream",
            description: "Stream output",
            category: "_custom",
            currentValue: true,
          },
        ],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        type: "config_options_update",
        options: [
          {
            type: "boolean",
            id: "stream",
            name: "Stream",
            description: "Stream output",
            category: "_custom",
            currentValue: true,
          },
        ],
      });
    });
  });
});
