import { describe, expect, it } from "vitest";
import { collectPendingFylloActionRailItems } from "@renderer/utils/fyllo-action-rail";
import type { Message, Session } from "@shared/types/chat";
import type { FylloActionStateStatus } from "@shared/types/fyllo-action";

function assistantTextMessage(text: string): Message {
  return {
    id: "message-1",
    role: "assistant",
    parts: [{ type: "text", text }],
  } as Message;
}

function userTextMessage(text: string): Message {
  return {
    id: "message-0",
    role: "user",
    parts: [{ type: "text", text }],
  } as Message;
}

function makeSession(options: {
  messages: Message[];
  actionStates?: Session["actionStates"];
}): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "claude-code",
    title: "Session",
    status: "ended",
    turnCount: 0,
    tokenUsage: { used: 128, size: 1024 },
    createdAt: new Date("2026-05-12T00:00:00.000Z"),
    updatedAt: new Date("2026-05-12T00:00:00.000Z"),
    messages: options.messages,
    actionStates: options.actionStates,
  };
}

function handledActionState(
  status: FylloActionStateStatus
): NonNullable<Session["actionStates"]>[string] {
  return {
    type: "task.create",
    status,
    updatedAt: "2026-05-12T00:00:00.000Z",
  };
}

describe("collectPendingFylloActionRailItems", () => {
  it("collects a ready assistant action with definition title, icon, and summary", () => {
    const session = makeSession({
      messages: [
        userTextMessage('<fyllo-action type="task.create">{"title":"忽略用户消息"}</fyllo-action>'),
        assistantTextMessage(
          '<fyllo-action type="task.create">{"title":"补齐错误处理"}</fyllo-action>'
        ),
      ],
    });

    expect(collectPendingFylloActionRailItems(session)).toEqual([
      {
        actionId: "chat:session-1:1:0:0",
        type: "task.create",
        title: "创建任务",
        icon: "i-lucide-list-plus",
        summary: "补齐错误处理",
      },
    ]);
  });

  it("collects multiple actions in the same text part by source order", () => {
    const session = makeSession({
      messages: [
        assistantTextMessage(
          [
            '<fyllo-action type="task.create">{"title":"A"}</fyllo-action>',
            '<fyllo-action type="task.create">{"title":"B"}</fyllo-action>',
          ].join("\n")
        ),
      ],
    });

    expect(collectPendingFylloActionRailItems(session).map((item) => item.actionId)).toEqual([
      "chat:session-1:0:0:0",
      "chat:session-1:0:0:1",
    ]);
    expect(collectPendingFylloActionRailItems(session).map((item) => item.summary)).toEqual([
      "A",
      "B",
    ]);
  });

  it("filters actions once any persisted action state exists", () => {
    const messages = [
      assistantTextMessage(
        [
          '<fyllo-action type="task.create">{"title":"Done"}</fyllo-action>',
          '<fyllo-action type="task.create">{"title":"Failed"}</fyllo-action>',
          '<fyllo-action type="task.create">{"title":"Cancelled"}</fyllo-action>',
          '<fyllo-action type="task.create">{"title":"Still pending"}</fyllo-action>',
        ].join("\n")
      ),
    ];
    const session = makeSession({
      messages,
      actionStates: {
        "chat:session-1:0:0:0": handledActionState("succeeded"),
        "chat:session-1:0:0:1": handledActionState("failed"),
        "chat:session-1:0:0:2": handledActionState("cancelled"),
      },
    });

    expect(collectPendingFylloActionRailItems(session).map((item) => item.summary)).toEqual([
      "Still pending",
    ]);
  });

  it("does not collect invalid or streaming actions", () => {
    const session = makeSession({
      messages: [
        assistantTextMessage(
          [
            '<fyllo-action type="task.create">{"title":""}</fyllo-action>',
            '<fyllo-action type="task.create">{"title":"Still streaming"}',
          ].join("\n")
        ),
      ],
    });

    expect(collectPendingFylloActionRailItems(session)).toEqual([]);
  });
});
