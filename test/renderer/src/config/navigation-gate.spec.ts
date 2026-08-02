import { describe, expect, it } from "vitest";
import { evaluateWorkspaceNavigation } from "@renderer/config/navigation-gate";
import { workspaceInfo } from "../fixtures/workspace";

describe("Workspace navigation gate", () => {
  const chatItem = { requiresWorkspace: true, capability: "chat" as const };

  it("allows Folder and Collection Chat shells when their primary Folder is available", () => {
    expect(evaluateWorkspaceNavigation(chatItem, null)).toEqual({
      enabled: false,
      reason: "请先打开 Workspace",
    });
    expect(evaluateWorkspaceNavigation(chatItem, workspaceInfo())).toEqual({ enabled: true });
    expect(
      evaluateWorkspaceNavigation(
        chatItem,
        workspaceInfo({ kind: "collection", chatAvailable: true })
      )
    ).toEqual({ enabled: true });
    expect(evaluateWorkspaceNavigation(chatItem, workspaceInfo({ chatAvailable: false }))).toEqual({
      enabled: false,
      reason: "Workspace 主目录不可用",
    });
  });
});
