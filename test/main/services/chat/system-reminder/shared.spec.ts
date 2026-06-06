import { beforeEach, describe, expect, it, vi } from "vitest";
import { wrapAsSystemReminder } from "@main/domain/chat/system-reminder-wrap";
import type { SystemReminderContext } from "@main/services/chat/system-reminder/types";
import { renderSystemReminderTemplate } from "@main/services/chat/system-reminder/providers/shared";
import chatTemplate from "@main/services/chat/system-reminder/templates/chat.txt?raw";
import applyTemplate from "@main/services/chat/system-reminder/templates/apply.txt?raw";

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock("@main/infra/logger", () => ({
  default: logger,
}));

function createContext(overrides: Partial<SystemReminderContext> = {}): SystemReminderContext {
  return {
    owner: "apply",
    projectPath: "/abs/project",
    cwd: "/abs/project",
    fylloSessionId: "session-1",
    agentId: "claude-acp",
    changeId: "change-1",
    stageIndex: 0,
    runId: "run-1",
    ...overrides,
  };
}

describe("renderSystemReminderTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders worktreePath placeholders", () => {
    const reminder = renderSystemReminderTemplate("cwd={{worktreePath}}", {
      ...createContext(),
      worktreePath: "/abs/.worktrees/foo",
    });

    expect(reminder).toBe("cwd=/abs/.worktrees/foo");
  });

  it("renders an empty string when worktreePath is undefined", () => {
    const reminder = renderSystemReminderTemplate("cwd={{worktreePath}}.", createContext());

    expect(reminder).toBe("cwd=.");
  });

  it("renders mainProjectPath as an alias of projectPath", () => {
    const reminder = renderSystemReminderTemplate(
      "main={{mainProjectPath}} project={{projectPath}}",
      createContext({
        projectPath: "/abs/myapp",
      })
    );

    expect(reminder).toBe("main=/abs/myapp project=/abs/myapp");
  });

  it("returns null and warns when worktreePath contains angle brackets", () => {
    const reminder = renderSystemReminderTemplate("cwd={{worktreePath}}", {
      ...createContext({ owner: "apply" }),
      worktreePath: "/abs/<bad>",
    });

    expect(reminder).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "[system-reminder] rejected reminder variable",
      expect.objectContaining({
        owner: "apply",
        field: "worktreePath",
        fylloSessionId: "session-1",
      })
    );
  });

  it("returns null and warns when mainProjectPath contains angle brackets via projectPath", () => {
    const reminder = renderSystemReminderTemplate("main={{mainProjectPath}}", {
      ...createContext({ owner: "chat" }),
      projectPath: "/abs/project>",
    });

    expect(reminder).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "[system-reminder] rejected reminder variable",
      expect.objectContaining({
        owner: "chat",
        field: "projectPath",
        fylloSessionId: "session-1",
      })
    );
  });

  it("preserves unknown placeholders as literals", () => {
    const reminder = renderSystemReminderTemplate("{{otherField}}", createContext());

    expect(reminder).toBe("{{otherField}}");
  });
});

describe("system-reminder templates", () => {
  it("allows chat.txt to be wrapped without nested wrapper tags", () => {
    expect(() => wrapAsSystemReminder(chatTemplate)).not.toThrow();
  });

  it("allows apply.txt to be wrapped without nested wrapper tags", () => {
    expect(() => wrapAsSystemReminder(applyTemplate)).not.toThrow();
  });

  it("routes chat and apply reminders to fyllo-skills guidelines", () => {
    const chatReminder = renderSystemReminderTemplate(
      chatTemplate,
      createContext({ owner: "chat" })
    );
    const applyReminder = renderSystemReminderTemplate(
      applyTemplate,
      createContext({ owner: "apply" })
    );

    expect(chatReminder).toContain("mcp__fyllo_skills__guidelines");
    expect(applyReminder).toContain("mcp__fyllo_skills__guidelines");
  });

  it("keeps detailed guideline template headings out of chat and apply reminders", () => {
    const chatReminder = renderSystemReminderTemplate(
      chatTemplate,
      createContext({ owner: "chat" })
    );
    const applyReminder = renderSystemReminderTemplate(
      applyTemplate,
      createContext({ owner: "apply" })
    );

    for (const reminder of [chatReminder, applyReminder]) {
      expect(reminder).not.toContain("AGENTS.md Index");
      expect(reminder).not.toContain("Guideline Document Format");
      expect(reminder).not.toContain("Maintenance Triggers");
    }
  });
});
