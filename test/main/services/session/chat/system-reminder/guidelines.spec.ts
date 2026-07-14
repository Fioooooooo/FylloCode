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
      projectPath: projectDir,
      cwd: projectDir,
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expect(reminder?.text).toContain(GUIDELINES_BLOCK_OPEN);
    expect(reminder?.text).toContain("</guidelines>");
    expect(reminder?.text).toContain("come from the user's project");
    expect(reminder?.text).toContain('"path": "guidelines/Testing.md"');
    expect(reminder?.text).toContain('"name": "Testing"');
    expect(reminder?.text).toContain('"description": "test conventions"');
    expect(reminder?.text).toContain('"vitest"');

    const guidelinesIndex = reminder?.text.indexOf(GUIDELINES_BLOCK_OPEN) ?? -1;
    expect(guidelinesIndex).toBeGreaterThan(reminder?.text.indexOf("</critical>") ?? 0);
    expect(guidelinesIndex).toBeLessThan(reminder?.text.indexOf("<fyllo-action-contract>") ?? 0);
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
      projectPath: projectDir,
      cwd: projectDir,
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      changeId: "change-1",
      stageIndex: 2,
      runId: "run-1",
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
        projectPath: projectDir,
        cwd: projectDir,
        fylloSessionId: "session-1",
        agentId: "claude-acp",
        changeId: "change-1",
        stageIndex: 1,
        runId: "run-1",
      });

      expect(reminder?.text).toEqual(expect.any(String));
      expect(reminder?.text).not.toContain(GUIDELINES_BLOCK_OPEN);
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
        projectPath: projectDir,
        cwd: worktreeDir,
        fylloSessionId: "session-1",
        agentId: "claude-acp",
        changeId: "change-1",
        stageIndex: 2,
        runId: "run-1",
        worktreePath: worktreeDir,
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
      projectPath: projectDir,
      cwd: projectDir,
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expect(reminder?.text).toContain("Array\\u003cT\\u003e");
    expect(reminder?.text.match(/<\/guidelines>/g)).toHaveLength(1);
  });

  it("does not inject the <guidelines> block into archive reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    await writeGuideline(projectDir, "Testing.md", {
      name: "Testing",
      description: "test conventions",
      keywords: ["vitest"],
    });

    const reminder = await resolveSystemReminder({
      owner: "archive",
      projectPath: projectDir,
      cwd: projectDir,
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      changeId: "change-1",
      stageIndex: 3,
      runId: "run-1",
    });

    expect(reminder?.text).toEqual(expect.any(String));
    expect(reminder?.text).not.toContain(GUIDELINES_BLOCK_OPEN);
  });
});
