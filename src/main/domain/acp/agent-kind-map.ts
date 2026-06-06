import type { AcpAgentKind } from "@shared/types/acp-agent";

// 判定准则与已知归类的 source of truth 是 `guidelines/Domain.md`；
// 新增或重新分类时必须双向同步该 guideline 与本文件。
export const ADAPTER_AGENT_IDS = new Set(["claude-acp", "codex-acp", "amp-acp"]);
export const BRIDGE_AGENT_IDS = new Set(["pi-acp"]);

export function resolveAgentKind(agentId: string): AcpAgentKind {
  if (ADAPTER_AGENT_IDS.has(agentId)) {
    return "adapter";
  }

  if (BRIDGE_AGENT_IDS.has(agentId)) {
    return "bridge";
  }

  return "native";
}
