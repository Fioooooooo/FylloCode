import { describe, expect, it } from "vitest";
import { buildHealthCheckReminder } from "@renderer/constants/health-check-reminder";
import type { ProjectInfo } from "@shared/types/project";

const project: ProjectInfo = {
  id: "project-1",
  name: "Project 1",
  path: "/tmp/project-1",
  metaPath: "/tmp/fyllocode/data/projects/project-1/meta.json",
  createdAt: new Date("2026-04-30T08:00:00.000Z"),
  lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
};

describe("buildHealthCheckReminder", () => {
  it("wraps sections in a system-reminder with project paths injected", () => {
    const reminder = buildHealthCheckReminder(project);

    expect(reminder.trim().startsWith("<system-reminder>")).toBe(true);
    expect(reminder.trim().endsWith("</system-reminder>")).toBe(true);
    expect(reminder.match(/^## .+$/gm)).toHaveLength(5);
    expect(reminder).toContain(project.path);
    expect(reminder).toContain(project.metaPath);
    expect(reminder).not.toContain("{projectPath}");
    expect(reminder).not.toContain("{metaPath}");
  });
});
