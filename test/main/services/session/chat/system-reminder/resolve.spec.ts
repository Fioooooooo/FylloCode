import { beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock("@main/infra/logger", () => ({
  default: logger,
}));

const CHAT_SECTION_TAGS = ["authority", "context", "rules", "workspace", "critical"] as const;
const CHAT_SECTION_TAGS_WITH_TASK = [
  "authority",
  "context",
  "task-context",
  "rules",
  "workspace",
  "critical",
] as const;

function getSection(text: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(text);
  return match?.[1]?.trim() ?? null;
}

function expectNonEmptyOrderedSections(text: string, tags: readonly string[]): void {
  let previousIndex = -1;

  for (const tag of tags) {
    const openIndex = text.indexOf(`<${tag}`);
    expect(openIndex, `${tag} should exist`).toBeGreaterThan(previousIndex);
    expect(getSection(text, tag), `${tag} should not be empty`).toEqual(expect.any(String));
    expect(getSection(text, tag)?.length, `${tag} should not be empty`).toBeGreaterThan(0);
    previousIndex = openIndex;
  }
}

describe("resolveSystemReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for unknown owners", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    await expect(
      resolveSystemReminder({
        owner: "unknown" as never,
        projectPath: "/tmp/project",
        cwd: "/tmp/project",
        fylloSessionId: "session-1",
        agentId: "claude-acp",
      })
    ).resolves.toBeNull();
  });

  it("returns a reminder for any non-empty agentId when the owner is known", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "some-other-agent",
    });

    expect(reminder).toEqual({
      type: "text",
      text: expect.any(String),
    });
    expect(reminder?.text.trim().startsWith("<system-reminder>")).toBe(true);
    expect(reminder?.text.trim().endsWith("</system-reminder>")).toBe(true);
  });

  it("wraps the rendered reminder for the default agent", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "apply",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      changeId: "change-1",
      stageIndex: 2,
      runId: "run-1",
    });

    expect(reminder).toEqual({
      type: "text",
      text: expect.stringContaining("change-1"),
    });
    expect(reminder?.text.trim().startsWith("<system-reminder>")).toBe(true);
    expect(reminder?.text.trim().endsWith("</system-reminder>")).toBe(true);
    expect(reminder?.text).toContain("Stage index: 2");
    expect(reminder?.text).toContain("Run id: run-1");
    expect(reminder?.text).toContain("<workspace>");
    expect(reminder?.text).toContain("Workspace Policy");
    expect(reminder?.text).toContain("the current workspace is the main workspace");
    expect(reminder?.text).toContain("`/tmp/project`");
    expect(reminder?.text.indexOf("<rules>")).toBeLessThan(
      reminder?.text.indexOf("<workspace>") ?? 0
    );
  });

  it("replaces allowed placeholders and preserves unknown placeholders", async () => {
    const { renderSystemReminderTemplate } =
      await import("@main/services/session/chat/system-reminder/providers/shared");

    const reminder = renderSystemReminderTemplate("Project {{projectPath}} {{unknownField}}", {
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expect(reminder).toContain("/tmp/project");
    expect(reminder).toContain("{{unknownField}}");
  });

  it("renders non-empty chat reminder sections in a stable order", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expect(reminder?.text.trim().startsWith("<system-reminder>")).toBe(true);
    expect(reminder?.text.trim().endsWith("</system-reminder>")).toBe(true);
    expectNonEmptyOrderedSections(reminder?.text ?? "", CHAT_SECTION_TAGS);
    expect(getSection(reminder?.text ?? "", "task-context")).toBeNull();
  });

  it("injects task context and task title into chat reminders when taskRef is present", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      taskRef: "local:task-1",
      taskTitle: "修复登录超时",
    });

    expectNonEmptyOrderedSections(reminder?.text ?? "", CHAT_SECTION_TAGS_WITH_TASK);
    expect(getSection(reminder?.text ?? "", "task-context")).toContain("local:task-1");
    expect(getSection(reminder?.text ?? "", "task-context")).toContain("修复登录超时");
  });

  it("keeps task context at ref level when task title is missing", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      taskRef: "local:task-1",
    });

    expectNonEmptyOrderedSections(reminder?.text ?? "", CHAT_SECTION_TAGS_WITH_TASK);
    expect(getSection(reminder?.text ?? "", "task-context")).toContain("local:task-1");
    expect(getSection(reminder?.text ?? "", "task-context")).not.toContain("Task title:");
  });

  it("omits task context from chat reminders when taskRef is absent", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expectNonEmptyOrderedSections(reminder?.text ?? "", CHAT_SECTION_TAGS);
    expect(getSection(reminder?.text ?? "", "task-context")).toBeNull();
  });

  it("does not inject task descriptions into chat reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      taskRef: "local:task-1",
      taskTitle: "修复登录超时",
    });

    expect(reminder?.text).not.toContain("登录超时的完整复现步骤");
  });

  it("encodes angle brackets in taskRef instead of dropping the reminder", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      taskRef: "local:<bad>",
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.text).toContain("local:\\u003cbad\\u003e");
    expect(logger.warn).toHaveBeenCalledWith(
      "[system-reminder] encoding angle brackets in reminder variable",
      expect.objectContaining({
        owner: "chat",
        field: "taskRef",
        fylloSessionId: "session-1",
      })
    );
  });

  it("encodes angle brackets in taskTitle instead of dropping the reminder", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      taskRef: "local:task-1",
      taskTitle: "bad<title>",
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.text).toContain("bad\\u003ctitle\\u003e");
    expect(logger.warn).toHaveBeenCalledWith(
      "[system-reminder] encoding angle brackets in reminder variable",
      expect.objectContaining({
        owner: "chat",
        field: "taskTitle",
        fylloSessionId: "session-1",
      })
    );
  });

  it("injects the Fyllo action contract into chat reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expect(reminder?.text).toContain("<fyllo-action-contract>");
    expect(reminder?.text).toContain("</fyllo-action-contract>");
    expect(reminder?.text).toContain('<fyllo-action type="task.create">');
    expect(reminder?.text).toContain('<fyllo-action type="plan.create">');
    expect(reminder?.text).toContain("task.create");
    expect(reminder?.text).toContain("plan.create");
    expect(reminder?.text).toContain("title");
    expect(reminder?.text).toContain("description");
    expect(reminder?.text).toContain("slug");
    expect(reminder?.text).toContain("goal");
    expect(reminder?.text).toContain("Enabled action types:");
  });

  it("does not inject Fyllo action contracts into apply or archive reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/session/chat/system-reminder");

    for (const owner of ["apply", "archive"] as const) {
      const reminder = await resolveSystemReminder({
        owner,
        projectPath: "/tmp/project",
        cwd: "/tmp/project",
        fylloSessionId: "session-1",
        agentId: "claude-acp",
        changeId: "change-1",
        stageIndex: 1,
        runId: "run-1",
      });

      expect(reminder?.text).not.toContain("<fyllo-action-contract>");
      expect(reminder?.text).not.toContain("</fyllo-action-contract>");
    }
  });
});
