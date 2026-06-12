import { promises as fs } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countArchives, countGuidelines, countSpecs } from "@main/services/overview/openspec-stats";

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
  });

  it("counts specs, archives, current-month archives, and markdown guidelines", async () => {
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
          case "/tmp/project/guidelines":
            return [
              dirent("IPC.md", "file"),
              dirent("MainProcess.md", "file"),
              dirent("draft.txt", "file"),
              dirent("archive", "directory"),
            ] as never;
          default:
            throw new Error(`unexpected path ${String(targetPath)}`);
        }
      }
    );

    await expect(countSpecs(projectPath)).resolves.toBe(2);
    await expect(countArchives(projectPath)).resolves.toEqual({ total: 3, thisMonth: 2 });
    await expect(countGuidelines(projectPath)).resolves.toBe(2);
  });

  it("returns zero counts when directories are missing", async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

    await expect(countSpecs(projectPath)).resolves.toBe(0);
    await expect(countArchives(projectPath)).resolves.toEqual({ total: 0, thisMonth: 0 });
    await expect(countGuidelines(projectPath)).resolves.toBe(0);
  });
});
