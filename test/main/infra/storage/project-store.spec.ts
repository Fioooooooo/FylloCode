import { describe, expect, it } from "vitest";
import {
  createProjectMeta,
  getProjectMetaPath,
  toProjectInfo,
} from "@main/infra/storage/project-store";
import type { ProjectMeta } from "@shared/types/project";

describe("project-store", () => {
  it("converts project meta to ProjectInfo with metaPath and healthScore", () => {
    const meta: ProjectMeta = {
      id: "encoded-project",
      name: "Project",
      path: "/tmp/project",
      healthScore: 75,
      createdAt: "2026-04-30T08:00:00.000Z",
      lastOpenedAt: "2026-05-01T08:00:00.000Z",
    };

    const info = toProjectInfo(meta);

    expect(info.healthScore).toBe(75);
    expect(info.metaPath).toBe(getProjectMetaPath("encoded-project"));
    expect(info.metaPath).toMatch(/data\/projects\/encoded-project\/meta\.json$/);
  });

  it("createProjectMeta carries healthScore through when provided", () => {
    const meta = createProjectMeta({
      id: "encoded-project",
      name: "Project",
      path: "/tmp/project",
      healthScore: 80,
    });

    expect(meta.healthScore).toBe(80);
  });

  it("createProjectMeta omits healthScore when not provided", () => {
    const meta = createProjectMeta({
      id: "encoded-project",
      name: "Project",
      path: "/tmp/project",
    });

    expect("healthScore" in meta).toBe(false);
  });
});
