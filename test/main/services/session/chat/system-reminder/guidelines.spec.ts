import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock("@main/infra/logger", () => ({
  default: logger,
}));

async function writeGuideline(
  projectDir: string,
  fileName: string,
  frontmatter: { name: string; description: string; keywords: string[] }
): Promise<void> {
  const guidelinesDir = join(projectDir, "guidelines");
  await mkdir(guidelinesDir, { recursive: true });
  await writeFile(
    join(guidelinesDir, fileName),
    [
      "---",
      `name: ${JSON.stringify(frontmatter.name)}`,
      `description: ${JSON.stringify(frontmatter.description)}`,
      `keywords: ${JSON.stringify(frontmatter.keywords)}`,
      "---",
      `# ${frontmatter.name}`,
    ].join("\n")
  );
}

// The templates mention `<guidelines>` inline; match the injected block via its
// standalone opening line to avoid false positives on those mentions.
const GUIDELINES_BLOCK_OPEN = "\n<guidelines>\n";

function workspaceSnapshot(projectDir: string) {
  return {
    workspaceId: "workspace-1",
    workspaceKind: "folder" as const,
    primaryFolderId: "folder-1",
    folders: [{ folderId: "folder-1", folderName: "Project", folderPath: projectDir }],
    cwd: projectDir,
    additionalDirectories: [],
  };
}

describe("system-reminder guidelines section", () => {
  let projectDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectDir = await mkdtemp(join(tmpdir(), "fyllo-reminder-"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("injects a <guidelines> block with the frontmatter index into chat reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    await writeGuideline(projectDir, "Testing.md", {
      name: "Testing",
      description: "test conventions",
      keywords: ["vitest"],
    });

    const reminder = await resolveSystemReminder({
      owner: "chat",
      workspaceId: "workspace-1",
      projectPath: projectDir,
      cwd: projectDir,
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      workspaceSnapshot: workspaceSnapshot(projectDir),
    });

    expect(reminder?.text).toContain(GUIDELINES_BLOCK_OPEN);
    expect(reminder?.text).toContain("</guidelines>");
    expect(reminder?.text).toContain("come from the user's authorized Folder repositories");
    expect(reminder?.text).toContain('"folderId": "folder-1"');
    expect(reminder?.text).toContain(`"folderPath": "${projectDir}"`);
    expect(reminder?.text).toContain('"path": "guidelines/Testing.md"');
    expect(reminder?.text).toContain('"name": "Testing"');
    expect(reminder?.text).toContain('"description": "test conventions"');
    expect(reminder?.text).toContain('"vitest"');

    const guidelinesIndex = reminder?.text.indexOf(GUIDELINES_BLOCK_OPEN) ?? -1;
    expect(guidelinesIndex).toBeGreaterThan(reminder?.text.indexOf("</critical>") ?? 0);
    expect(guidelinesIndex).toBeLessThan(reminder?.text.indexOf("<fyllo-action-contract>") ?? 0);
  });

  it("keeps duplicate relative guideline paths in separate Folder groups", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");
    const secondaryDir = await mkdtemp(join(tmpdir(), "fyllo-reminder-secondary-"));
    try {
      await writeGuideline(projectDir, "Testing.md", {
        name: "Primary Testing",
        description: "primary rules",
        keywords: ["primary"],
      });
      await writeGuideline(secondaryDir, "Testing.md", {
        name: "Secondary Testing",
        description: "secondary rules",
        keywords: ["secondary"],
      });

      const reminder = await resolveSystemReminder({
        owner: "chat",
        workspaceId: "workspace-1",
        projectPath: projectDir,
        cwd: projectDir,
        fylloSessionId: "session-1",
        agentId: "claude-acp",
        workspaceSnapshot: {
          ...workspaceSnapshot(projectDir),
          workspaceKind: "collection",
          folders: [
            { folderId: "folder-1", folderName: "Primary", folderPath: projectDir },
            { folderId: "folder-2", folderName: "Secondary", folderPath: secondaryDir },
          ],
          additionalDirectories: [secondaryDir],
        },
      });

      expect(reminder?.text).toContain('"folderId": "folder-1"');
      expect(reminder?.text).toContain('"folderId": "folder-2"');
      expect(reminder?.text).toContain('"name": "Primary Testing"');
      expect(reminder?.text).toContain('"name": "Secondary Testing"');
      expect(reminder?.text.match(/"path": "guidelines\/Testing\.md"/g)).toHaveLength(2);
    } finally {
      await rm(secondaryDir, { recursive: true, force: true });
    }
  });

  it("isolates an unavailable Folder while retaining readable Folder guidelines", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");
    const missingPath = join(projectDir, "missing-folder");
    await writeGuideline(projectDir, "Testing.md", {
      name: "Testing",
      description: "readable rules",
      keywords: ["vitest"],
    });

    const reminder = await resolveSystemReminder({
      owner: "chat",
      workspaceId: "workspace-1",
      projectPath: projectDir,
      cwd: projectDir,
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      workspaceSnapshot: {
        ...workspaceSnapshot(projectDir),
        workspaceKind: "collection",
        folders: [
          { folderId: "folder-1", folderName: "Readable", folderPath: projectDir },
          { folderId: "folder-missing", folderName: "Missing", folderPath: missingPath },
        ],
        additionalDirectories: [missingPath],
      },
    });

    expect(reminder?.text).toContain('"name": "Testing"');
    expect(reminder?.text).toContain('"folderId": "folder-missing"');
    expect(reminder?.text).toContain('"code": "FOLDER_UNAVAILABLE"');
    expect(logger.warn).toHaveBeenCalledWith(
      "[system-reminder] guideline Folder is unavailable",
      expect.objectContaining({ folderId: "folder-missing" })
    );
  });

  it("injects the <guidelines> block into apply reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    await writeGuideline(projectDir, "IPC.md", {
      name: "IPC",
      description: "channel rules",
      keywords: ["ipc"],
    });

    const reminder = await resolveSystemReminder({
      owner: "apply",
      workspaceId: "workspace-1",
      projectPath: projectDir,
      cwd: projectDir,
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      changeId: "change-1",
      stageIndex: 2,
      runId: "run-1",
      folderId: "folder-1",
      folderName: "Project",
    });

    expect(reminder?.text).toContain(GUIDELINES_BLOCK_OPEN);
    expect(reminder?.text).toContain('"path": "guidelines/IPC.md"');
    expect(reminder?.text.indexOf(GUIDELINES_BLOCK_OPEN)).toBeGreaterThan(
      reminder?.text.indexOf("</critical>") ?? 0
    );
  });

  it("omits the <guidelines> block when the project has no guidelines", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    for (const owner of ["chat", "apply"] as const) {
      const reminder = await resolveSystemReminder({
        owner,
        workspaceId: "workspace-1",
        projectPath: projectDir,
        cwd: projectDir,
        fylloSessionId: "session-1",
        agentId: "claude-acp",
        changeId: "change-1",
        stageIndex: 1,
        runId: "run-1",
        ...(owner === "chat" ? { workspaceSnapshot: workspaceSnapshot(projectDir) } : {}),
      });

      expect(reminder?.text).toEqual(expect.any(String));
      if (owner === "chat") {
        expect(reminder?.text).toContain(GUIDELINES_BLOCK_OPEN);
        expect(reminder?.text).toContain('"guidelines": []');
      } else {
        expect(reminder?.text).not.toContain(GUIDELINES_BLOCK_OPEN);
      }
    }
  });

  it("scans the worktree instead of the main project in apply reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const worktreeDir = await mkdtemp(join(tmpdir(), "fyllo-reminder-worktree-"));
    try {
      await writeGuideline(projectDir, "MainOnly.md", {
        name: "MainOnly",
        description: "main project doc",
        keywords: ["main"],
      });
      await writeGuideline(worktreeDir, "WorktreeOnly.md", {
        name: "WorktreeOnly",
        description: "worktree doc",
        keywords: ["worktree"],
      });

      const reminder = await resolveSystemReminder({
        owner: "apply",
        workspaceId: "workspace-1",
        projectPath: projectDir,
        cwd: worktreeDir,
        fylloSessionId: "session-1",
        agentId: "claude-acp",
        changeId: "change-1",
        stageIndex: 2,
        runId: "run-1",
        worktreePath: worktreeDir,
        folderId: "folder-1",
        folderName: "Project",
      });

      expect(reminder?.text).toContain('"name": "WorktreeOnly"');
      expect(reminder?.text).not.toContain("MainOnly");
    } finally {
      await rm(worktreeDir, { recursive: true, force: true });
    }
  });

  it("escapes angle brackets in frontmatter values", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    await writeGuideline(projectDir, "Tricky.md", {
      name: "Tricky",
      description: "uses Array<T> and </guidelines> breakout",
      keywords: ["generics"],
    });

    const reminder = await resolveSystemReminder({
      owner: "chat",
      workspaceId: "workspace-1",
      projectPath: projectDir,
      cwd: projectDir,
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      workspaceSnapshot: workspaceSnapshot(projectDir),
    });

    expect(reminder?.text).toContain("Array\\u003cT\\u003e");
    expect(reminder?.text.match(/<\/guidelines>/g)).toHaveLength(1);
  });

  it("injects only the fixed owner worktree guidelines into archive reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");
    const worktreeDir = await mkdtemp(join(tmpdir(), "fyllo-reminder-archive-"));
    try {
      await writeGuideline(projectDir, "MainOnly.md", {
        name: "MainOnly",
        description: "main rules",
        keywords: ["main"],
      });
      await writeGuideline(worktreeDir, "OwnerOnly.md", {
        name: "OwnerOnly",
        description: "owner rules",
        keywords: ["owner"],
      });

      const reminder = await resolveSystemReminder({
        owner: "archive",
        workspaceId: "workspace-1",
        projectPath: projectDir,
        cwd: worktreeDir,
        fylloSessionId: "session-1",
        agentId: "claude-acp",
        changeId: "change-1",
        stageIndex: 3,
        runId: "run-1",
        worktreePath: worktreeDir,
        folderId: "folder-1",
        folderName: "Project",
      });

      expect(reminder?.text).toContain(GUIDELINES_BLOCK_OPEN);
      expect(reminder?.text).toContain('"name": "OwnerOnly"');
      expect(reminder?.text).not.toContain("MainOnly");
    } finally {
      await rm(worktreeDir, { recursive: true, force: true });
    }
  });
});
