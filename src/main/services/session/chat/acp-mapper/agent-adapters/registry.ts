import { claudeAcpAgentEventAdapter } from "./claude";
import { codexAcpAgentEventAdapter } from "./codex";
import { identityAcpAgentEventAdapter, type AcpAgentEventAdapter } from "./types";

const ADAPTER_BY_AGENT_ID: ReadonlyMap<string, AcpAgentEventAdapter> = new Map([
  ["codex", codexAcpAgentEventAdapter],
  ["codex-acp", codexAcpAgentEventAdapter],
  ["claude", claudeAcpAgentEventAdapter],
  ["claude-acp", claudeAcpAgentEventAdapter],
]);

export function resolveAcpAgentEventAdapter(agentId?: string): AcpAgentEventAdapter {
  return agentId === undefined
    ? identityAcpAgentEventAdapter
    : (ADAPTER_BY_AGENT_ID.get(agentId) ?? identityAcpAgentEventAdapter);
}
