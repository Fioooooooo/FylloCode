import { promises as fs } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countArchives,
  countGuidelines,
  countSpecs,
} from "@main/services/insight/overview/openspec-stats";

const mocks = vi.hoisted(() => ({
  scanGuidelines: vi.fn(),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(),
    },
  };
});

vi.mock("@main/infra/guidelines/scan-guidelines", () => ({
  scanGuidelines: mocks.scanGuidelines,
}));

type MockDirent = {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
};

function dirent(name: string, kind: "directory" | "file"): MockDirent {
  return {
    name,
    isDirectory: () => kind === "directory",
    isFile: () => kind === "file",
  };
}

describe("overview openspec stats", () => {
  const projectPath = "/tmp/project";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T08:00:00.000Z"));
    mocks.scanGuidelines.mockResolvedValue([
      { path: "guidelines/IPC.md", name: "IPC", description: null, keywords: null },
      {
        path: "guidelines/MainProcess.md",
        name: "MainProcess",
        description: null,
        keywords: null,
      },
      {
        path: "guidelines/frontend/Routing.md",
        name: "Routing",
        description: null,
        keywords: null,
      },
    ]);
  });

  it("counts specs, archives, current-month archives, and recursive markdown guidelines", async () => {
    vi.mocked(fs.readdir).mockImplementation(
      async (targetPath: Parameters<typeof fs.readdir>[0]) => {
        switch (String(targetPath)) {
          case "/tmp/project/openspec/specs":
            return [
              dirent("project-overview", "directory"),
              dirent("lineage", "directory"),
              dirent("README.md", "file"),
            ] as never;
          case "/tmp/project/openspec/changes/archive":
            return [
              dirent("2026-06-01-first", "directory"),
              dirent("2026-06-10-second", "directory"),
              dirent("2026-05-30-old", "directory"),
              dirent("README.md", "file"),
            ] as never;
          default:
            throw new Error(`unexpected path ${String(targetPath)}`);
        }
      }
    );

    await expect(countSpecs(projectPath)).resolves.toBe(2);
    await expect(countArchives(projectPath)).resolves.toEqual({ total: 3, thisMonth: 2 });
    await expect(countGuidelines(projectPath)).resolves.toBe(3);
    expect(mocks.scanGuidelines).toHaveBeenCalledWith(projectPath);
  });

  it("returns zero counts when directories are missing", async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));
    mocks.scanGuidelines.mockRejectedValue(new Error("ENOENT"));

    await expect(countSpecs(projectPath)).resolves.toBe(0);
    await expect(countArchives(projectPath)).resolves.toEqual({ total: 0, thisMonth: 0 });
    await expect(countGuidelines(projectPath)).resolves.toBe(0);
  });
});
