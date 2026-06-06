import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectMeta } from "@shared/types/project";

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  pathExists: vi.fn(),
}));

vi.mock("@main/infra/storage/project-store", async () => {
  const actual = await vi.importActual<typeof import("@main/infra/storage/project-store")>(
    "@main/infra/storage/project-store"
  );
  return {
    ...actual,
    loadProject: mocks.loadProject,
    saveProject: mocks.saveProject,
  };
});

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: (...args: Parameters<typeof actual.promises.access>) => mocks.pathExists(...args),
    },
  };
});

import { adoptExistingFolder, updateProject } from "@main/services/project/project-service";

function existingMeta(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id: "encoded",
    name: "Project",
    path: "/tmp/project",
    healthScore: 80,
    createdAt: "2026-04-30T08:00:00.000Z",
    lastOpenedAt: "2026-05-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("project-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathExists.mockResolvedValue(undefined);
  });

  describe("adoptExistingFolder", () => {
    it("preserves the existing healthScore when re-adopting a known folder", async () => {
      mocks.loadProject.mockResolvedValue(existingMeta());

      const info = await adoptExistingFolder("/tmp/project");

      expect(info.healthScore).toBe(80);
      const persisted = mocks.saveProject.mock.calls[0]?.[0] as ProjectMeta;
      expect(persisted.healthScore).toBe(80);
    });

    it("does not set healthScore when adopting a brand new folder", async () => {
      mocks.loadProject.mockResolvedValue(null);

      const info = await adoptExistingFolder("/tmp/new-project");

      expect(info.healthScore).toBeUndefined();
      const persisted = mocks.saveProject.mock.calls[0]?.[0] as ProjectMeta;
      expect(persisted.healthScore).toBeUndefined();
    });
  });

  describe("updateProject", () => {
    it("preserves the existing healthScore when patch omits it", async () => {
      mocks.loadProject.mockResolvedValue(existingMeta());

      const info = await updateProject({
        id: "encoded",
        patch: { name: "Renamed" },
      });

      expect(info.healthScore).toBe(80);
      expect(info.name).toBe("Renamed");
    });

    it("overwrites healthScore when patch provides it", async () => {
      mocks.loadProject.mockResolvedValue(existingMeta());

      const info = await updateProject({
        id: "encoded",
        patch: { healthScore: 42 },
      });

      expect(info.healthScore).toBe(42);
    });
  });
});
