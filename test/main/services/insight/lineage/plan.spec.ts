import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-plan-service-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import { sessionPlansDir } from "@main/infra/storage/project-paths";
import { approvePlan, readPlan, savePlanBody } from "@main/services/insight/lineage/plan";

const projectPath = "/tmp/project";
const sessionId = "session-1";
const slug = "2026-06-29-plan-a";

function planPath(): string {
  return `${sessionPlansDir(projectPath, sessionId)}/${slug}.md`;
}

function writePlan(content = "## 任务目标\n\nDraft body\n"): void {
  mkdirSync(sessionPlansDir(projectPath, sessionId), { recursive: true });
  writeFileSync(
    planPath(),
    [
      "---",
      `slug: ${slug}`,
      "goal: Need review",
      "createdAt: 2026-06-29T00:00:00.000Z",
      "status: draft",
      "---",
      content,
    ].join("\n"),
    "utf8"
  );
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("lineage plan service", () => {
  it("reads frontmatter and markdown body", async () => {
    writePlan();

    await expect(readPlan(projectPath, sessionId, slug)).resolves.toEqual({
      slug,
      goal: "Need review",
      createdAt: "2026-06-29T00:00:00.000Z",
      status: "draft",
      body: "## 任务目标\n\nDraft body\n",
    });
  });

  it("saves body without changing frontmatter", async () => {
    writePlan();

    await expect(savePlanBody(projectPath, sessionId, slug, "## 新正文\n")).resolves.toMatchObject({
      status: "draft",
      body: "## 新正文\n",
    });
    const content = readFileSync(planPath(), "utf8");
    expect(content).toContain(`slug: ${slug}`);
    expect(content).toContain("goal: Need review");
    expect(content).toContain("status: draft");
    expect(content).toContain("## 新正文");
  });

  it("approves draft plans idempotently", async () => {
    writePlan();

    await expect(approvePlan(projectPath, sessionId, slug)).resolves.toMatchObject({
      status: "approved",
    });
    await expect(approvePlan(projectPath, sessionId, slug)).resolves.toMatchObject({
      status: "approved",
    });
    expect(readFileSync(planPath(), "utf8")).toContain("status: approved");
  });

  it("rejects missing and damaged plans", async () => {
    await expect(readPlan(projectPath, sessionId, slug)).rejects.toMatchObject({
      code: IpcErrorCodes.PLAN_NOT_FOUND,
    });

    mkdirSync(sessionPlansDir(projectPath, sessionId), { recursive: true });
    writeFileSync(planPath(), "not frontmatter", "utf8");

    await expect(savePlanBody(projectPath, sessionId, slug, "new")).rejects.toMatchObject({
      code: IpcErrorCodes.PLAN_INVALID,
    });
    expect(readFileSync(planPath(), "utf8")).toBe("not frontmatter");
  });

  it("rejects unsafe path segments", async () => {
    await expect(readPlan(projectPath, "../session", slug)).rejects.toMatchObject({
      code: IpcErrorCodes.VALIDATION_ERROR,
    });
    await expect(readPlan(projectPath, sessionId, "../secret")).rejects.toMatchObject({
      code: IpcErrorCodes.VALIDATION_ERROR,
    });
  });
});
