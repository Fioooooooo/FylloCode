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
        kind: "reasoning_delta",
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
        kind: "available_commands_update",
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
        kind: "available_commands_update",
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
        kind: "available_commands_update",
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
        kind: "plan_update",
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
        kind: "plan_update",
        entries: [],
      });
    });

    it("falls back to medium/pending for unrecognized priority/status", () => {
      const update = {
        sessionUpdate: "plan",
        entries: [{ content: "未知字段", priority: "urgent", status: "blocked" }],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        kind: "plan_update",
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
      kind: "usage_update",
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
      kind: "usage_update",
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
        kind: "config_options_update",
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
        kind: "config_options_update",
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
        kind: "config_options_update",
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

  describe("tool_call 字段位置无关提取", () => {
    it("codex Edit：start 时从 content 提取 diff、从 rawInput 提取 input", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "call_codex_1",
        title: "Edit foo.txt",
        kind: "edit",
        status: "in_progress",
        rawInput: { changes: { "foo.txt": { type: "add" } } },
        content: [{ type: "diff", path: "/foo.txt", newText: "created\n" }],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        kind: "tool_call_start",
        toolCallId: "call_codex_1",
        title: "Edit foo.txt",
        toolKind: "edit",
        input: { changes: { "foo.txt": { type: "add" } } },
        diff: [{ path: "/foo.txt", newText: "created\n", oldText: undefined }],
        locations: undefined,
      });
    });

    it("qodercli：start 时已携带 rawInput", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "toolu_bdrk_1",
        title: "Read",
        kind: "read",
        status: "in_progress",
        rawInput: { file_path: "/a.txt" },
        content: [],
      } as unknown as SessionUpdate;

      const result = mapSessionUpdate(update);
      expect(result).toMatchObject({
        kind: "tool_call_start",
        toolCallId: "toolu_bdrk_1",
        input: { file_path: "/a.txt" },
      });
    });

    it("gemini replace：tool_call_update 携带 diff", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "replace__1",
        status: "completed",
        content: [{ type: "diff", path: "/test.txt", newText: "new", oldText: "old" }],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toMatchObject({
        kind: "tool_call_update",
        toolCallId: "replace__1",
        status: "completed",
        diff: [{ path: "/test.txt", newText: "new", oldText: "old" }],
      });
    });

    it("孤儿 update：透传 title/toolKind 供建卡", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "list_directory__1",
        title: "tool-call-trace",
        kind: "search",
        status: "completed",
        content: [],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toMatchObject({
        kind: "tool_call_update",
        toolCallId: "list_directory__1",
        title: "tool-call-trace",
        toolKind: "search",
      });
    });
  });

  describe("agent 怪癖补丁", () => {
    it("qodercli completed + rawOutput.error → 降级 failed，content 取 error 文本", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "toolu_bdrk_grep",
        status: "completed",
        rawOutput: { error: "spawn rg ENOENT" },
        content: [{ type: "content", content: { type: "text", text: "spawn rg ENOENT" } }],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toMatchObject({
        kind: "tool_call_update",
        status: "failed",
        content: "spawn rg ENOENT",
      });
    });

    it("completed 无 rawOutput.error → 保持 completed", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "toolu_bdrk_ok",
        status: "completed",
        rawOutput: "ok",
        content: [{ type: "content", content: { type: "text", text: "done" } }],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toMatchObject({
        kind: "tool_call_update",
        status: "completed",
        content: "done",
      });
    });

    it("codex MCP {server,tool} → title 归一为 server/tool", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "call_mcp_1",
        title: "Tool: fyllo-cortex/guidelines",
        kind: "other",
        status: "in_progress",
        rawInput: { server: "fyllo-cortex", tool: "guidelines", arguments: { mode: "read" } },
        content: [],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toMatchObject({
        kind: "tool_call_start",
        title: "fyllo-cortex/guidelines",
      });
    });

    it("非 codex 形态 MCP → fallback 原 title", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "call_mcp_2",
        title: "fyllo-specs_explore",
        kind: "other",
        status: "in_progress",
        rawInput: { targetPath: "/x" },
        content: [],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toMatchObject({
        kind: "tool_call_start",
        title: "fyllo-specs_explore",
      });
    });
  });
});
