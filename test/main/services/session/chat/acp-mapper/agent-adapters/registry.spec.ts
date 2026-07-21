import { describe, expect, it } from "vitest";
import { claudeAcpAgentEventAdapter } from "@main/services/session/chat/acp-mapper/agent-adapters/claude";
import { codexAcpAgentEventAdapter } from "@main/services/session/chat/acp-mapper/agent-adapters/codex";
import { resolveAcpAgentEventAdapter } from "@main/services/session/chat/acp-mapper/agent-adapters/registry";
import { identityAcpAgentEventAdapter } from "@main/services/session/chat/acp-mapper/agent-adapters/types";

describe("ACP Agent adapter registry", () => {
  it.each(["codex", "codex-acp"])("resolves Codex alias %s", (agentId) => {
    expect(resolveAcpAgentEventAdapter(agentId)).toBe(codexAcpAgentEventAdapter);
  });

  it.each(["claude", "claude-acp"])("resolves Claude alias %s", (agentId) => {
    expect(resolveAcpAgentEventAdapter(agentId)).toBe(claudeAcpAgentEventAdapter);
  });

  it("uses the identity adapter for missing and unknown Agent ids", () => {
    expect(resolveAcpAgentEventAdapter()).toBe(identityAcpAgentEventAdapter);
    expect(resolveAcpAgentEventAdapter("gemini")).toBe(identityAcpAgentEventAdapter);
  });
});
