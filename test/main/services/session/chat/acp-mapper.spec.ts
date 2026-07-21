import { describe, expect, it } from "vitest";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { mapSessionUpdate, normalizeClaudeMcpTool } from "@main/services/session/chat/acp-mapper";

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

    it("drops Codex whitespace-only thought chunks", () => {
      const update = {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "\n\n" },
      } as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex" })).toBeNull();
    });

    it("unwraps Codex bold thought summaries for plain-text rendering", () => {
      const update = {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "**Planning the implementation**" },
      } as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex-acp" })).toEqual({
        kind: "reasoning_delta",
        text: "Planning the implementation\n",
      });
    });

    it("does not normalize thought chunks from other agents", () => {
      const update = {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "**Keep markdown**" },
      } as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "qodercli" })).toEqual({
        kind: "reasoning_delta",
        text: "**Keep markdown**",
      });
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
    it("maps entries to agenda_update keeping only content/priority/status", () => {
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
        kind: "agenda_update",
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
        kind: "agenda_update",
        entries: [],
      });
    });

    it("falls back to medium/pending for unrecognized priority/status", () => {
      const update = {
        sessionUpdate: "plan",
        entries: [{ content: "未知字段", priority: "urgent", status: "blocked" }],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update)).toEqual({
        kind: "agenda_update",
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

      expect(mapSessionUpdate(update, { agentId: "codex" })).toEqual({
        kind: "tool_call_start",
        toolCallId: "call_codex_1",
        toolName: "Edit",
        title: "Edit foo.txt",
        toolKind: "edit",
        input: { changes: { "foo.txt": { type: "add" } } },
        diff: [{ path: "/foo.txt", newText: "created\n", oldText: undefined }],
        locations: undefined,
      });
    });

    it("codex 文件 add：根据结构化 diff 生成 Create filename title", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "call_codex_add",
        title: "Editing files",
        kind: "edit",
        status: "in_progress",
        content: [
          {
            type: "diff",
            path: "/project/tmp.txt",
            oldText: null,
            newText: "initial content\n",
            _meta: { kind: "add" },
          },
        ],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex-acp" })).toMatchObject({
        kind: "tool_call_start",
        toolName: "Edit",
        title: "Create tmp.txt",
        toolKind: "edit",
      });
    });

    it("codex 文件 update：根据结构化 diff 生成 Edit filename title", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "call_codex_update",
        title: "Editing files",
        kind: "edit",
        status: "in_progress",
        content: [
          {
            type: "diff",
            path: "/project/tmp.txt",
            oldText: "before\n",
            newText: "after\n",
            _meta: { kind: "update" },
          },
        ],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex" })).toMatchObject({
        kind: "tool_call_start",
        toolName: "Edit",
        title: "Edit tmp.txt",
        toolKind: "edit",
      });
    });

    it("codex 文件 delete：根据结构化 diff 生成 Delete filename title", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "call_codex_delete",
        title: "Editing files",
        kind: "edit",
        status: "in_progress",
        content: [
          {
            type: "diff",
            path: "/project/tmp.txt",
            oldText: "before\n",
            newText: "",
            _meta: { kind: "delete" },
          },
        ],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex-acp" })).toMatchObject({
        kind: "tool_call_start",
        toolName: "Edit",
        title: "Delete tmp.txt",
        toolKind: "edit",
      });
    });

    it("codex 多文件 diff：同类操作显示数量，混合操作显示 Change", () => {
      const base = {
        sessionUpdate: "tool_call",
        toolCallId: "call_codex_multi",
        title: "Editing files",
        kind: "edit",
        status: "in_progress",
      };
      const add = (path: string) => ({
        type: "diff",
        path,
        oldText: null,
        newText: "new\n",
        _meta: { kind: "add" },
      });
      const update = (path: string) => ({
        type: "diff",
        path,
        oldText: "old\n",
        newText: "new\n",
        _meta: { kind: "update" },
      });

      expect(
        mapSessionUpdate(
          { ...base, content: [add("/project/a.ts"), add("/project/b.ts")] } as SessionUpdate,
          { agentId: "codex" }
        )
      ).toMatchObject({ title: "Create 2 files" });
      expect(
        mapSessionUpdate(
          { ...base, content: [add("/project/a.ts"), update("/project/b.ts")] } as SessionUpdate,
          { agentId: "codex" }
        )
      ).toMatchObject({ title: "Change 2 files" });
    });

    it("文件 diff title 归一只作用于 codex，缺失操作元数据时回退原 title", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "call_edit_fallback",
        title: "Editing files",
        kind: "edit",
        status: "in_progress",
        content: [{ type: "diff", path: "/project/tmp.txt", newText: "content\n" }],
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex" })).toMatchObject({
        title: "Editing files",
      });
      expect(
        mapSessionUpdate(
          {
            ...update,
            content: [
              {
                type: "diff",
                path: "/project/tmp.txt",
                newText: "content\n",
                _meta: { kind: "add" },
              },
            ],
          } as SessionUpdate,
          { agentId: "qodercli" }
        )
      ).toMatchObject({ title: "Editing files" });
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

    it("codex MCP {server,tool} → 新旧 ACP title 都统一为 server/tool", () => {
      for (const title of ["Tool: fyllo-specs/explore", "mcp.fyllo-specs.explore"]) {
        const update = {
          sessionUpdate: "tool_call",
          toolCallId: "call_mcp_1",
          title,
          kind: "execute",
          status: "in_progress",
          rawInput: {
            server: "fyllo-specs",
            tool: "explore",
            arguments: { targetPath: "/project", includeInstruction: true },
          },
          content: [],
          _meta: { is_mcp_tool_call: true },
        } as unknown as SessionUpdate;

        expect(mapSessionUpdate(update, { agentId: "codex" })).toMatchObject({
          kind: "tool_call_start",
          toolName: "fyllo-specs/explore",
          title: "Call fyllo-specs/explore",
        });
      }
    });

    it("codex MCP orphan update → toolName 与 title 同样统一为 server/tool", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_mcp_orphan",
        title: "mcp.fyllo-specs.explore",
        kind: "execute",
        status: "in_progress",
        rawInput: {
          server: "fyllo-specs",
          tool: "explore",
          arguments: { targetPath: "/project" },
        },
        _meta: { is_mcp_tool_call: true },
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex-acp" })).toMatchObject({
        kind: "tool_call_update",
        toolName: "fyllo-specs/explore",
        title: "Call fyllo-specs/explore",
      });
    });

    it("codex terminal output delta → in_progress outputDelta", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_terminal_1",
        _meta: { terminal_output_delta: { data: "line 1\n" } },
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex" })).toMatchObject({
        kind: "tool_call_update",
        toolCallId: "call_terminal_1",
        status: "in_progress",
        outputDelta: "line 1\n",
      });
    });

    it("codex terminal exit infers status and uses formatted final output", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_terminal_1",
        rawOutput: { formatted_output: "line 1\nline 2\n" },
        _meta: { terminal_exit: { exit_code: 0 } },
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex" })).toMatchObject({
        kind: "tool_call_update",
        toolCallId: "call_terminal_1",
        status: "completed",
        content: "line 1\nline 2\n",
      });
    });

    it("codex non-zero terminal exit infers failed status", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_terminal_2",
        rawOutput: { stderr: "command failed" },
        _meta: { terminal_exit: { exit_code: 2 } },
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "codex" })).toMatchObject({
        kind: "tool_call_update",
        status: "failed",
        content: "command failed",
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

  describe("claude-acp 适配", () => {
    it("MCP 工具 start：mcp__server__tool 归一为 server/tool（toolName 与 title）", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "toolu_mcp_1",
        title: "mcp__tavily__tavily_search",
        kind: "other",
        status: "pending",
        rawInput: {},
        content: [],
        _meta: { claudeCode: { toolName: "mcp__tavily__tavily_search" } },
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
        kind: "tool_call_start",
        toolCallId: "toolu_mcp_1",
        toolName: "tavily/tavily_search",
        title: "Call tavily/tavily_search",
        toolKind: "other",
      });
    });

    it("MCP 工具 tool_call_update：toolName 与孤儿 title 同样归一", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "toolu_mcp_1",
        status: "in_progress",
        title: "mcp__tavily__tavily_search",
        kind: "other",
        rawInput: { query: "acp" },
        _meta: { claudeCode: { toolName: "mcp__tavily__tavily_search" } },
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
        kind: "tool_call_update",
        toolCallId: "toolu_mcp_1",
        toolName: "tavily/tavily_search",
        title: "Call tavily/tavily_search",
        input: { query: "acp" },
      });
    });

    it("原生工具 title 不含 mcp__ 前缀时原样透传（不误伤具体命令）", () => {
      const update = {
        sessionUpdate: "tool_call_update",
        toolCallId: "toolu_bash_1",
        status: "in_progress",
        title: "ls -la /tmp",
        kind: "execute",
        rawInput: { command: "ls -la /tmp" },
        _meta: { claudeCode: { toolName: "Bash" } },
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
        kind: "tool_call_update",
        toolName: "Bash",
        title: "ls -la /tmp",
      });
    });

    it("子代理内嵌工具 start：解析 parentToolUseId 为 parentToolCallId", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "toolu_child_1",
        title: "Read foo.txt",
        kind: "read",
        status: "pending",
        rawInput: { file_path: "/foo.txt" },
        content: [],
        _meta: { claudeCode: { toolName: "Read", parentToolUseId: "toolu_parent_1" } },
      } as unknown as SessionUpdate;

      expect(mapSessionUpdate(update, { agentId: "claude-acp" })).toMatchObject({
        kind: "tool_call_start",
        toolCallId: "toolu_child_1",
        parentToolCallId: "toolu_parent_1",
      });
    });

    it("无 parentToolUseId 时 parentToolCallId 为 undefined", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "toolu_top_1",
        title: "Read File",
        kind: "read",
        status: "pending",
        rawInput: {},
        content: [],
        _meta: { claudeCode: { toolName: "Read" } },
      } as unknown as SessionUpdate;

      const event = mapSessionUpdate(update, { agentId: "claude-acp" });
      expect(event).toMatchObject({ kind: "tool_call_start", toolName: "Read" });
      expect((event as { parentToolCallId?: string }).parentToolCallId).toBeUndefined();
    });

    it("非 claude agent 不解析 parentToolUseId、不归一 mcp__ title", () => {
      const update = {
        sessionUpdate: "tool_call",
        toolCallId: "call_other_1",
        title: "mcp__tavily__tavily_search",
        kind: "other",
        status: "pending",
        rawInput: {},
        content: [],
        _meta: { claudeCode: { toolName: "mcp__tavily__tavily_search", parentToolUseId: "p1" } },
      } as unknown as SessionUpdate;

      const event = mapSessionUpdate(update, { agentId: "gemini" });
      // 非 claude：沿用 _meta.claudeCode.toolName 原始串（现状行为），不做 server/tool 归一。
      expect(event).toMatchObject({
        kind: "tool_call_start",
        title: "mcp__tavily__tavily_search",
      });
      expect((event as { parentToolCallId?: string }).parentToolCallId).toBeUndefined();
    });
  });
});

describe("normalizeClaudeMcpTool", () => {
  it("mcp__server__tool → server/tool", () => {
    expect(normalizeClaudeMcpTool("mcp__tavily__tavily_search")).toBe("tavily/tavily_search");
  });

  it("tool 名自身含下划线时仅按首个 __ 划定 server 边界", () => {
    expect(normalizeClaudeMcpTool("mcp__fyllo_specs__create_proposal")).toBe(
      "fyllo_specs/create_proposal"
    );
  });

  it("非 mcp__ 前缀原样返回", () => {
    expect(normalizeClaudeMcpTool("Bash")).toBe("Bash");
    expect(normalizeClaudeMcpTool("ls -la /tmp")).toBe("ls -la /tmp");
  });

  it("退化形态（缺 server 或 tool 段）原样返回", () => {
    expect(normalizeClaudeMcpTool("mcp__onlyserver")).toBe("mcp__onlyserver");
    expect(normalizeClaudeMcpTool("mcp____tool")).toBe("mcp____tool");
  });
});
