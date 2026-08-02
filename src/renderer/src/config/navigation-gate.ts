import type { ActivityBarItem } from "./activity-bar";
import type { WorkspaceInfo } from "@shared/types/workspace";

export interface NavigationGateResult {
  enabled: boolean;
  reason?: string;
}

export function evaluateWorkspaceNavigation(
  item: Pick<ActivityBarItem, "requiresWorkspace" | "capability">,
  workspace: WorkspaceInfo | null
): NavigationGateResult {
  if (!item.requiresWorkspace) return { enabled: true };
  if (!workspace) return { enabled: false, reason: "请先打开 Workspace" };
  if (item.capability === "chat" && !workspace.chatAvailable) {
    return {
      enabled: false,
      reason: "Collection Workspace 的多目录对话将在下一阶段启用",
    };
  }
  return { enabled: true };
}
