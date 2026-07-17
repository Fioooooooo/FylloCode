import { describe, expect, it } from "vitest";
import { collectFylloActionRailItems as collectPendingFylloActionRailItems } from "@renderer/features/fyllo-action/integration/event-rail";
import type { Message, Session } from "@shared/types/chat";
import type { FylloActionStateStatus } from "@shared/fyllo-action/protocol";

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
    isPinned: false,
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
  status: FylloActionStateStatus,
  type: NonNullable<Session["actionStates"]>[string]["type"] = "task.create"
): NonNullable<Session["actionStates"]>[string] {
  return {
    type,
    status,
    revision: 1,
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
          ].join("\n\n")
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

  it("collects knowledge.flag rail actions with candidate summary and context paths", () => {
    const session = makeSession({
      messages: [
        assistantTextMessage(
          [
            '<fyllo-action type="knowledge.flag">',
            '{"summary":"markstream-vue theme subscriptions must stay outside leaf instances.","contextPaths":["src/renderer/src/components/chat/MessageMarkdown.vue"]}',
            "</fyllo-action>",
          ].join("")
        ),
      ],
    });

    expect(collectPendingFylloActionRailItems(session)).toEqual([
      {
        actionId: "chat:session-1:0:0:0",
        type: "knowledge.flag",
        title: "发现可沉淀知识",
        icon: "i-lucide-bookmark-plus",
        summary: "markstream-vue theme subscriptions must stay outside leaf instances.",
        contextPaths: ["src/renderer/src/components/chat/MessageMarkdown.vue"],
      },
    ]);
  });

  it("keeps persisted failed actions and filters resolved states", () => {
    const messages = [
      assistantTextMessage(
        [
          '<fyllo-action type="task.create">{"title":"Done"}</fyllo-action>',
          '<fyllo-action type="task.create">{"title":"Failed"}</fyllo-action>',
          '<fyllo-action type="task.create">{"title":"Cancelled"}</fyllo-action>',
          '<fyllo-action type="task.create">{"title":"Still pending"}</fyllo-action>',
        ].join("\n\n")
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
      "Failed",
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
          ].join("\n\n")
        ),
      ],
    });

    expect(collectPendingFylloActionRailItems(session)).toEqual([]);
  });

  it("excludes prose, inline-code, fenced, list, and blockquote literals", () => {
    const example = '<fyllo-action type="task.create">{"title":"literal"}</fyllo-action>';
    const session = makeSession({
      messages: [
        assistantTextMessage(
          [
            `用法是 ${example}`,
            `\`${example}\``,
            `\`\`\`text\n${example}\n\`\`\``,
            `- ${example}`,
            `> ${example}`,
          ].join("\n\n")
        ),
      ],
    });

    expect(collectPendingFylloActionRailItems(session)).toEqual([]);
  });

  it("preserves a candidate ordinal after a literal occurrence", () => {
    const literal = '示例：<fyllo-action type="task.create">{"title":"literal"}</fyllo-action>';
    const candidate = '<fyllo-action type="task.create">{"title":"ready"}</fyllo-action>';
    const session = makeSession({
      messages: [assistantTextMessage([literal, candidate].join("\n\n"))],
    });

    expect(collectPendingFylloActionRailItems(session)).toEqual([
      expect.objectContaining({
        actionId: "chat:session-1:0:0:1",
        summary: "ready",
      }),
    ]);
  });

  it("keeps an existing persisted ready state after a literal occurrence", () => {
    const literal = '示例：<fyllo-action type="task.create">{"title":"literal"}</fyllo-action>';
    const candidate = '<fyllo-action type="task.create">{"title":"ready"}</fyllo-action>';
    const session = makeSession({
      messages: [assistantTextMessage([literal, candidate].join("\n\n"))],
      actionStates: {
        "chat:session-1:0:0:1": handledActionState("ready"),
      },
    });

    expect(collectPendingFylloActionRailItems(session)).toEqual([
      expect.objectContaining({
        actionId: "chat:session-1:0:0:1",
        summary: "ready",
      }),
    ]);
  });
});
