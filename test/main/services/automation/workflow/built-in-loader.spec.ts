import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-built-in-workflows-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => join(tempRoot, "userData", subPath)),
  getResourcesPath: vi.fn(() => join(tempRoot, "resources")),
}));

import {
  initBuiltInWorkflows,
  listBuiltInWorkflowFileNames,
} from "@main/services/automation/workflow/built-in-loader";

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("built-in workflow loader", () => {
  it("lists workflow files from the infra-provided resources directory", async () => {
    const sourceDir = join(tempRoot, "resources", "workflows", "built-in");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "quick-apply.yaml"), "name: 最小流程\n", "utf8");
    writeFileSync(join(sourceDir, "notes.txt"), "ignored\n", "utf8");

    await expect(listBuiltInWorkflowFileNames()).resolves.toEqual(["quick-apply.yaml"]);
  });

  it("initializes missing user workflow files without overwriting existing ones", async () => {
    const sourceDir = join(tempRoot, "resources", "workflows", "built-in");
    const userDir = join(tempRoot, "userData", "workflows");
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(sourceDir, "quick-apply.yaml"), "name: packaged\n", "utf8");
    writeFileSync(join(sourceDir, "new-flow.yml"), "name: new\n", "utf8");
    writeFileSync(join(userDir, "quick-apply.yaml"), "name: user edited\n", "utf8");

    await initBuiltInWorkflows();

    expect(readFileSync(join(userDir, "quick-apply.yaml"), "utf8")).toBe("name: user edited\n");
    expect(readFileSync(join(userDir, "new-flow.yml"), "utf8")).toBe("name: new\n");
  });
});
