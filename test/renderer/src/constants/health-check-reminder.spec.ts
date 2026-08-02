import { describe, expect, it } from "vitest";
import { buildHealthCheckReminder } from "@renderer/constants/health-check-reminder";
import type { WorkspaceInfo } from "@shared/types/workspace";
import { workspaceInfo } from "../fixtures/workspace";

const workspace: WorkspaceInfo = workspaceInfo({
  id: "project-1",
  name: "Project 1",
  folderPath: "/tmp/project-1",
  createdAt: new Date("2026-04-30T08:00:00.000Z"),
  lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
});

describe("buildHealthCheckReminder", () => {
  it("wraps sections in a system-reminder with Workspace paths injected", () => {
    const reminder = buildHealthCheckReminder(workspace);

    expect(reminder.trim().startsWith("<system-reminder>")).toBe(true);
    expect(reminder.trim().endsWith("</system-reminder>")).toBe(true);
    expect(reminder.match(/^## .+$/gm)).toHaveLength(5);
    expect(reminder).toContain(workspace.primaryFolder.path);
    expect(reminder).toContain(workspace.primaryFolderMetaPath);
    expect(reminder).toContain("Update the `healthScore` field");
    expect(reminder).not.toContain("{projectPath}");
  });
});
