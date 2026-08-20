import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { DynamicToolUIPart } from "ai";
import { describe, expect, it } from "vitest";
import kimiFixture from "./fixtures/custom-kimi-a447f3c7/0.36.1-argument-stream-title-stability.json";
import remainingToolsFixture from "./fixtures/custom-kimi-a447f3c7/0.36.1-remaining-tool-shapes.json";
import { MessageAssembler } from "@main/domain/session/chat/message-assembler";
import type { SessionEvent } from "@main/domain/session/chat/session-events";
import { mapSessionUpdate } from "@main/services/session/chat/acp-mapper";

describe("Kimi Code ACP event compatibility", () => {
  it("keeps the start title while Kimi streams JSON arguments, then accepts the structured title", () => {
    const assembler = new MessageAssembler("kimi-fixture-session");
    const titles: Array<string | undefined> = [];

    for (const rawUpdate of kimiFixture.updates as SessionUpdate[]) {
      const event = mapSessionUpdate(rawUpdate, { agentId: kimiFixture.capture.agentId });
      expect(event).not.toBeNull();
      assembler.apply(event!);
      titles.push(
        ((assembler.snapshot()?.parts.at(-1) as DynamicToolUIPart | undefined)?.title ??
          undefined) as string | undefined
      );
    }

    expect(titles).toEqual(["Bash", "Bash", "Bash", "Running: ls -la", "Running: ls -la"]);

    const part = assembler.flush()!.parts[0] as DynamicToolUIPart;
    expect(part).toMatchObject({
      toolCallId: "kimi-bash-1",
      toolName: "Bash",
      title: "Running: ls -la",
      state: "output-available",
      input: { command: "ls -la" },
      output: "total 0\n",
      toolMetadata: { toolKind: "execute", acpStatus: "completed" },
    });
  });

  it("preserves remaining Kimi tool lifecycles and structured inputs", () => {
    const eventsByTool = new Map<string, SessionEvent[]>();

    for (const rawUpdate of remainingToolsFixture.updates as SessionUpdate[]) {
      const event = mapSessionUpdate(rawUpdate, {
        agentId: remainingToolsFixture.capture.agentId,
      });
      expect(event).not.toBeNull();
      if (
        event === null ||
        (event.kind !== "tool_call_start" && event.kind !== "tool_call_update")
      ) {
        continue;
      }

      const events = eventsByTool.get(event.toolCallId) ?? [];
      events.push(event);
      eventsByTool.set(event.toolCallId, events);
    }

    const expectations = [
      {
        toolCallId: "kimi-agent-1",
        toolName: "Agent",
        title: "Launching explore agent: 只读检查工作区顶层条目",
        titles: [
          "Agent",
          "Agent",
          "Launching explore agent: 只读检查工作区顶层条目",
          "Launching explore agent: 只读检查工作区顶层条目",
        ],
        state: "output-error",
        toolKind: "other",
        acpStatus: "failed",
        input: { subagent_type: "explore" },
        errorText:
          "agent_id: agent-0\nactual_subagent_type: explore\nstatus: failed\n\nsubagent error: stopped before completion by user.",
      },
      {
        toolCallId: "kimi-agent-2",
        toolName: "Agent",
        title: "Launching explore agent: 采样读取失败终态",
        titles: [
          "Agent",
          "Agent",
          "Launching explore agent: 采样读取失败终态",
          "Launching explore agent: 采样读取失败终态",
        ],
        state: "output-error",
        toolKind: "other",
        acpStatus: "failed",
        input: { subagent_type: "explore" },
        errorText:
          "agent_id: agent-1\nactual_subagent_type: explore\nstatus: failed\n\nsubagent error: stopped before completion by user.",
      },
      {
        toolCallId: "kimi-agent-swarm-1",
        toolName: "AgentSwarm",
        title: "Launching agent swarm: 最小只读工作区采样",
        titles: [
          "AgentSwarm",
          "AgentSwarm",
          "Launching agent swarm: 最小只读工作区采样",
          "Launching agent swarm: 最小只读工作区采样",
        ],
        state: "output-available",
        toolKind: "other",
        acpStatus: "completed",
        input: { subagent_type: "explore", items: expect.any(Array) },
        output:
          '<agent_swarm_result>\n<summary>aborted: 2</summary>\n<subagent agent_id="agent-2" state="started" outcome="aborted">interrupted before completion</subagent>\n<subagent agent_id="agent-3" state="started" outcome="aborted">interrupted before completion</subagent>\n</agent_swarm_result>',
      },
      {
        toolCallId: "kimi-web-search-1",
        toolName: "WebSearch",
        title: "Searching: Kimi Code ACP official documentation",
        titles: [
          "WebSearch",
          "WebSearch",
          "Searching: Kimi Code ACP official documentation",
          "Searching: Kimi Code ACP official documentation",
        ],
        state: "output-available",
        toolKind: "fetch",
        acpStatus: "completed",
        input: { query: "Kimi Code ACP official documentation" },
        output:
          "Title: Kimi Code ACP reference\nURL: https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html\nSnippet: ACP command reference.",
      },
      {
        toolCallId: "kimi-fetch-url-1",
        toolName: "FetchURL",
        title: "Fetching: https://raw.githubusercontent.com/MoonshotAI/kimi-…",
        titles: [
          "FetchURL",
          "FetchURL",
          "Fetching: https://raw.githubusercontent.com/MoonshotAI/kimi-…",
          "Fetching: https://raw.githubusercontent.com/MoonshotAI/kimi-…",
        ],
        state: "output-available",
        toolKind: "other",
        acpStatus: "completed",
        input: {
          url: "https://raw.githubusercontent.com/MoonshotAI/kimi-cli/main/docs/en/reference/kimi-acp.md",
        },
        output:
          "The returned content is the main text extracted from the page.\n\n# kimi acp Subcommand\n\nThe command starts an ACP server.",
      },
      {
        toolCallId: "kimi-skill-1",
        toolName: "Skill",
        title: "Invoke skill adapt-acp-events",
        titles: [
          "Skill",
          "Skill",
          "Invoke skill adapt-acp-events",
          "Invoke skill adapt-acp-events",
        ],
        state: "output-error",
        toolKind: "other",
        acpStatus: "failed",
        input: { skill: "adapt-acp-events" },
        errorText: 'Skill "adapt-acp-events" not found in the current skill listing.',
      },
    ] as const;

    expect([...eventsByTool.keys()]).toEqual(expectations.map(({ toolCallId }) => toolCallId));

    for (const expectation of expectations) {
      const assembler = new MessageAssembler(`kimi-${expectation.toolCallId}`);
      const titles: Array<string | undefined> = [];
      for (const event of eventsByTool.get(expectation.toolCallId) ?? []) {
        assembler.apply(event);
        titles.push(
          ((assembler.snapshot()?.parts.at(-1) as DynamicToolUIPart | undefined)?.title ??
            undefined) as string | undefined
        );
      }

      const part = assembler.flush()!.parts[0] as DynamicToolUIPart;
      expect(titles).toEqual(expectation.titles);
      expect(part).toMatchObject({
        toolCallId: expectation.toolCallId,
        toolName: expectation.toolName,
        title: expectation.title,
        state: expectation.state,
        input: expectation.input,
        toolMetadata: {
          toolKind: expectation.toolKind,
          acpStatus: expectation.acpStatus,
        },
      });

      if (expectation.state === "output-available") {
        expect(part).toMatchObject({ output: expectation.output });
      } else {
        expect(part).toMatchObject({ errorText: expectation.errorText });
      }
    }
  });
});
