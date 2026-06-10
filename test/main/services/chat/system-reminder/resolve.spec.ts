import { beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock("@main/infra/logger", () => ({
  default: logger,
}));

describe("resolveSystemReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for unknown owners", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

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
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

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
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

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

  it("returns null and logs a warning when a variable contains angle brackets", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

    await expect(
      resolveSystemReminder({
        owner: "chat",
        projectPath: "/tmp/<project>",
        cwd: "/tmp/project",
        fylloSessionId: "session-1",
        agentId: "claude-acp",
      })
    ).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledWith(
      "[system-reminder] rejected reminder variable",
      expect.objectContaining({
        owner: "chat",
        field: "projectPath",
        fylloSessionId: "session-1",
      })
    );
  });

  it("replaces allowed placeholders and preserves unknown placeholders", async () => {
    const { renderSystemReminderTemplate } =
      await import("@main/services/chat/system-reminder/providers/shared");

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

  it("renders the chat workspace tool contract", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expect(reminder?.text).toContain("<workspace>");
    expect(reminder?.text).toContain("Workspace Policy");
    expect(reminder?.text).toContain("Let the tool choose and prepare the proposal workspace");
    expect(reminder?.text).toContain("state.workspace.path");
    expect(reminder?.text).toContain("mcp__fyllo_specs__create-proposal");
    expect(reminder?.text).toContain("bypasses the MCP workspace runtime");
    expect(reminder?.text).not.toContain("git worktree add");
  });

  it("injects task context and task title into chat reminders when taskRef is present", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      taskRef: "local:task-1",
      taskTitle: "修复登录超时",
    });

    expect(reminder?.text).toContain("<task-context>");
    expect(reminder?.text).toContain("existing task local:task-1");
    expect(reminder?.text).toContain("Task title: 修复登录超时.");
  });

  it("keeps task context at ref level when task title is missing", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
      taskRef: "local:task-1",
    });

    expect(reminder?.text).toContain("<task-context>");
    expect(reminder?.text).toContain("existing task local:task-1");
    expect(reminder?.text).not.toContain("Task title:");
  });

  it("omits task context from chat reminders when taskRef is absent", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expect(reminder?.text).not.toContain("This chat session was started from existing task");
    expect(reminder?.text).not.toContain("started from existing task");
  });

  it("does not inject task descriptions into chat reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

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

  it("returns null and logs a warning when taskRef contains angle brackets", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

    await expect(
      resolveSystemReminder({
        owner: "chat",
        projectPath: "/tmp/project",
        cwd: "/tmp/project",
        fylloSessionId: "session-1",
        agentId: "claude-acp",
        taskRef: "local:<bad>",
      })
    ).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledWith(
      "[system-reminder] rejected reminder variable",
      expect.objectContaining({
        owner: "chat",
        field: "taskRef",
        fylloSessionId: "session-1",
      })
    );
  });

  it("returns null and logs a warning when taskTitle contains angle brackets", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

    await expect(
      resolveSystemReminder({
        owner: "chat",
        projectPath: "/tmp/project",
        cwd: "/tmp/project",
        fylloSessionId: "session-1",
        agentId: "claude-acp",
        taskRef: "local:task-1",
        taskTitle: "bad<title>",
      })
    ).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledWith(
      "[system-reminder] rejected reminder variable",
      expect.objectContaining({
        owner: "chat",
        field: "taskTitle",
        fylloSessionId: "session-1",
      })
    );
  });

  it("injects the Fyllo action contract into chat reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expect(reminder?.text).toContain("## Fyllo Action Tags");
    expect(reminder?.text).toContain('<fyllo-action type="task.create">');
    expect(reminder?.text).toContain("task.create");
    expect(reminder?.text).toContain("title");
    expect(reminder?.text).toContain("Required non-empty task title.");
    expect(reminder?.text).toContain("description");
    expect(reminder?.text).toContain("Optional plain-text task description.");
    expect(reminder?.text).toContain("The only allowed attribute is `type`.");
    expect(reminder?.text).toContain("FylloCode controls the UI and fixed confirm/cancel buttons.");
    expect(reminder?.text).toContain("confirmLabel");
  });

  it("injects the create-proposal task binding branch rule into chat reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

    const reminder = await resolveSystemReminder({
      owner: "chat",
      projectPath: "/tmp/project",
      cwd: "/tmp/project",
      fylloSessionId: "session-1",
      agentId: "claude-acp",
    });

    expect(reminder?.text).toContain(
      "After `mcp__fyllo_specs__create-proposal` returns and before writing any proposal artifacts"
    );
    expect(reminder?.text).toContain("If a `<task-context>` block is present");
    expect(reminder?.text).toContain("If no `<task-context>` block is present");
    expect(reminder?.text).toContain('<fyllo-action type="task.create">');
  });

  it("does not inject Fyllo action contracts into apply or archive reminders", async () => {
    const { resolveSystemReminder } = await import("@main/services/chat/system-reminder");

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

      expect(reminder?.text).not.toContain("## Fyllo Action Tags");
      expect(reminder?.text).not.toContain('<fyllo-action type="task.create">');
      expect(reminder?.text).not.toContain("After `mcp__fyllo_specs__create-proposal` returns");
    }
  });
});
