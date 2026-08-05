import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import spawn from "cross-spawn";
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";
import { runWithRequestContext } from "../../../src/mcp-servers/shared/request-context";
import {
  resolveProjectRoot,
  validateTargetPath,
} from "../../../src/mcp-servers/fyllo-specs/src/utils/project-root";
import { createPlanTool } from "../../../src/mcp-servers/fyllo-specs/src/tools/create-plan";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(prefix: string): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  temporaryDirectories.push(root);
  return root;
}

function createRepository(): string {
  const root = createTemporaryDirectory("fyllo-specs-scope-");
  const result = spawn.sync("git", ["init"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return root;
}

interface DescriptorOptions {
  workspaceId?: string;
  workspaceDataDir?: string;
  mcpEventDir?: string;
  sessionId?: string;
}

function descriptor(folderPaths: string[], options: DescriptorOptions = {}) {
  return parseMcpWorkspaceDescriptor({
    version: 2,
    workspaceId: options.workspaceId ?? "workspace-1",
    workspaceKind: folderPaths.length === 1 ? "folder" : "collection",
    primaryFolderId: "folder-1",
    folders: folderPaths.map((folderPath, index) => ({
      folderId: `folder-${index + 1}`,
      folderName: `Folder ${index + 1}`,
      folderPath,
    })),
    workspaceDataDir: options.workspaceDataDir ?? "/tmp/workspace-data",
    ...(options.mcpEventDir ? { mcpEventDir: options.mcpEventDir } : {}),
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
  });
}

interface CreatePlanState {
  planPath?: string;
  errors?: Array<{ type: string; message: string; code?: string }>;
}

function parseState(text: string): CreatePlanState {
  const match = /<state>\n([\s\S]*?)\n<\/state>/.exec(text);
  if (!match?.[1]) {
    throw new Error("create-plan output does not contain state");
  }
  return JSON.parse(match[1]) as CreatePlanState;
}

async function runCreatePlan(input: {
  folderPaths: string[];
  workspaceId?: string;
  workspaceDataDir: string;
  mcpEventDir?: string;
  sessionId: string;
  slug?: string;
}): Promise<CreatePlanState> {
  return runWithRequestContext(
    descriptor(input.folderPaths, {
      workspaceDataDir: input.workspaceDataDir,
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.mcpEventDir ? { mcpEventDir: input.mcpEventDir } : {}),
    }),
    async () =>
      parseState(
        await createPlanTool({
          goal: "Plan safely",
          slug: input.slug ?? "safe-plan",
        })
      )
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("fyllo-specs Workspace scope", () => {
  it("uses the unique descriptor Folder and validates its main worktree", () => {
    const root = createRepository();

    runWithRequestContext(descriptor([root]), () => {
      expect(resolveProjectRoot()).toBe(root);
      expect(validateTargetPath(root)).toEqual({ ok: true, resolved: root });
    });
  });

  it("returns an owner-required error instead of selecting primary in multi-root", () => {
    runWithRequestContext(descriptor(["/tmp/repo-a", "/tmp/repo-b"]), () => {
      expect(validateTargetPath("/tmp/repo-a")).toEqual(
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining("folderId is required"),
        })
      );
    });
  });

  it.each(["single-root", "multi-root"])(
    "creates a session-scoped plan in %s Workspace without a Folder owner",
    async (workspaceShape) => {
      const workspaceDataDir = createTemporaryDirectory("fyllo-specs-plan-data-");
      const mcpEventDir = join(workspaceDataDir, "mcp-events");
      const folderPaths =
        workspaceShape === "single-root"
          ? [createRepository()]
          : [
              createTemporaryDirectory("fyllo-specs-non-git-a-"),
              createTemporaryDirectory("fyllo-specs-non-git-b-"),
              createTemporaryDirectory("fyllo-specs-non-git-c-"),
            ];

      if (workspaceShape === "multi-root") {
        mkdirSync(join(folderPaths[0]!, "openspec", "changes", "change-a"), { recursive: true });
        mkdirSync(join(folderPaths[0]!, "openspec", "changes", "change-b"), { recursive: true });
        writeFileSync(
          join(folderPaths[0]!, "openspec", "changes", "change-a", "proposal.md"),
          "## Why\n\nActive A\n",
          "utf8"
        );
        writeFileSync(
          join(folderPaths[0]!, "openspec", "changes", "change-b", "proposal.md"),
          "## Why\n\nActive B\n",
          "utf8"
        );
      }

      const state = await runCreatePlan({
        folderPaths,
        workspaceDataDir,
        mcpEventDir,
        sessionId: "session-1",
      });

      expect(state.errors).toBeUndefined();
      expect(state.planPath).toMatch(
        new RegExp(
          `${workspaceDataDir}/sessions/session-1/plans/\\d{4}-\\d{2}-\\d{2}-safe-plan\\.md$`
        )
      );
      const planContent = readFileSync(state.planPath!, "utf8");
      const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(planContent);
      expect(load(frontmatterMatch?.[1] ?? "")).toMatchObject({
        goal: "Plan safely",
        status: "draft",
        slug: expect.stringMatching(/^\d{4}-\d{2}-\d{2}-safe-plan$/),
      });
      expect(planContent).toContain("status: draft");
      expect(planContent).toContain('goal: "Plan safely"');
      expect(planContent).toContain("## 任务目标/Goal");
      expect(planContent).toContain("## 验证方式/Verification");
      appendFileSync(state.planPath!, "\nImplementation details\n", "utf8");
      expect(readFileSync(state.planPath!, "utf8")).toContain("Implementation details");

      const eventFiles = readdirSync(mcpEventDir).filter((file) => file.endsWith(".json"));
      expect(eventFiles).toHaveLength(1);
      const event = JSON.parse(readFileSync(join(mcpEventDir, eventFiles[0]!), "utf8")) as Record<
        string,
        unknown
      >;
      expect(event).toMatchObject({
        tool: "create-plan",
        workspaceId: "workspace-1",
        sessionId: "session-1",
      });
      expect(event.planSlug).toMatch(/^\d{4}-\d{2}-\d{2}-safe-plan$/);
      expect(event).not.toHaveProperty("folderId");
    }
  );

  it("isolates identical plan slugs by Workspace and Session", async () => {
    const folderPaths = [createTemporaryDirectory("fyllo-specs-plan-folder-")];
    const workspaceAData = createTemporaryDirectory("fyllo-specs-plan-workspace-a-");
    const workspaceBData = createTemporaryDirectory("fyllo-specs-plan-workspace-b-");

    const workspaceA = await runCreatePlan({
      folderPaths,
      workspaceId: "workspace-a",
      workspaceDataDir: workspaceAData,
      sessionId: "session-1",
    });
    const workspaceB = await runCreatePlan({
      folderPaths,
      workspaceId: "workspace-b",
      workspaceDataDir: workspaceBData,
      sessionId: "session-1",
    });
    const sessionB = await runCreatePlan({
      folderPaths,
      workspaceId: "workspace-a",
      workspaceDataDir: workspaceAData,
      sessionId: "session-2",
    });

    expect(new Set([workspaceA.planPath, workspaceB.planPath, sessionB.planPath]).size).toBe(3);
    expect(workspaceA.planPath).toContain("/sessions/session-1/");
    expect(sessionB.planPath).toContain("/sessions/session-2/");
  });

  it("returns EEXIST without overwriting a duplicate plan", async () => {
    const workspaceDataDir = createTemporaryDirectory("fyllo-specs-plan-duplicate-");
    const folderPaths = [createTemporaryDirectory("fyllo-specs-plan-folder-")];
    const input = { folderPaths, workspaceDataDir, sessionId: "session-1" };

    const first = await runCreatePlan(input);
    const original = readFileSync(first.planPath!, "utf8");
    const duplicate = await runCreatePlan(input);

    expect(duplicate.planPath).toBeUndefined();
    expect(duplicate.errors).toEqual([expect.objectContaining({ type: "Error", code: "EEXIST" })]);
    expect(readFileSync(first.planPath!, "utf8")).toBe(original);
  });

  it.each([
    ["unsafe/path", "slug must be a kebab-case fragment"],
    ["2026-08-05-safe-plan", "slug must not include a yyyy-MM-dd date prefix"],
  ])("rejects invalid slug %s before file IO", async (slug, message) => {
    const workspaceDataDir = createTemporaryDirectory("fyllo-specs-plan-invalid-");
    const state = await runCreatePlan({
      folderPaths: [createTemporaryDirectory("fyllo-specs-plan-folder-")],
      workspaceDataDir,
      sessionId: "session-1",
      slug,
    });

    expect(state.planPath).toBeUndefined();
    expect(state.errors).toEqual([expect.objectContaining({ type: "Error", message })]);
    expect(existsSync(join(workspaceDataDir, "sessions"))).toBe(false);
  });

  it("returns a structured filesystem error when the Workspace data root is not writable", async () => {
    const parent = createTemporaryDirectory("fyllo-specs-plan-write-error-");
    const workspaceDataFile = join(parent, "workspace-data-file");
    writeFileSync(workspaceDataFile, "not a directory", "utf8");

    const state = await runCreatePlan({
      folderPaths: [createTemporaryDirectory("fyllo-specs-plan-folder-")],
      workspaceDataDir: workspaceDataFile,
      sessionId: "session-1",
    });

    expect(state.planPath).toBeUndefined();
    expect(state.errors).toEqual([
      expect.objectContaining({ type: "Error", code: expect.stringMatching(/ENOTDIR|EEXIST/) }),
    ]);
  });
});
