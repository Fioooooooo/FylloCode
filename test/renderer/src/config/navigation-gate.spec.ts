import { describe, expect, it } from "vitest";
import { evaluateWorkspaceNavigation } from "@renderer/config/navigation-gate";
import { workspaceInfo } from "../fixtures/workspace";

describe("Workspace navigation gate", () => {
  const chatItem = { requiresWorkspace: true, capability: "chat" as const };

  it("uses one capability result for missing, Folder and Collection Workspaces", () => {
    expect(evaluateWorkspaceNavigation(chatItem, null)).toEqual({
      enabled: false,
      reason: "请先打开 Workspace",
    });
    expect(evaluateWorkspaceNavigation(chatItem, workspaceInfo())).toEqual({ enabled: true });
    expect(
      evaluateWorkspaceNavigation(
        chatItem,
        workspaceInfo({ kind: "collection", chatAvailable: false })
      )
    ).toEqual({
      enabled: false,
      reason: "Collection Workspace 的多目录对话将在下一阶段启用",
    });
  });
});
