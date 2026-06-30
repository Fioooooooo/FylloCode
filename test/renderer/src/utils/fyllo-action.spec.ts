import { describe, expect, it, vi } from "vitest";
import { parseFylloActionNode, type FylloActionMarkdownNode } from "@renderer/utils/fyllo-action";

function actionNode(options: Partial<FylloActionMarkdownNode> = {}): FylloActionMarkdownNode {
  return {
    attrs: {
      type: "task.create",
    },
    content: '{"title":"补齐错误处理"}',
    ...options,
  };
}

describe("parseFylloActionNode", () => {
  it("returns pending without parsing JSON while the node is loading", () => {
    const parseSpy = vi.spyOn(JSON, "parse");

    const result = parseFylloActionNode(
      actionNode({
        loading: true,
        content: '{"title":',
      })
    );

    expect(result).toEqual({
      status: "pending",
      type: "task.create",
    });
    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it("parses a valid task.create action", () => {
    const result = parseFylloActionNode(
      actionNode({
        content: '{"title":"补齐错误处理","description":"整理异常分支"}',
      })
    );

    expect(result).toEqual({
      status: "ready",
      type: "task.create",
      payload: {
        title: "补齐错误处理",
        description: "整理异常分支",
      },
    });
  });

  it("parses a valid plan.create action", () => {
    const result = parseFylloActionNode(
      actionNode({
        attrs: {
          type: "plan.create",
        },
        content: '{"slug":"2026-06-29-plan-a","goal":"Need review"}',
      })
    );

    expect(result).toEqual({
      status: "ready",
      type: "plan.create",
      payload: {
        slug: "2026-06-29-plan-a",
        goal: "Need review",
      },
    });
  });

  it("rejects plan.create payloads containing planPath", () => {
    const result = parseFylloActionNode(
      actionNode({
        attrs: {
          type: "plan.create",
        },
        content: '{"slug":"2026-06-29-plan-a","goal":"Need review","planPath":"/tmp/plan.md"}',
      })
    );

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" ? result.error.code : null).toBe("invalid_payload");
  });

  it("rejects an unknown action type", () => {
    const result = parseFylloActionNode(
      actionNode({
        attrs: {
          type: "task.delete",
        },
      })
    );

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" ? result.error.code : null).toBe("unknown_type");
  });

  it("rejects extra attributes", () => {
    const result = parseFylloActionNode(
      actionNode({
        attrs: {
          type: "task.create",
          title: "创建任务",
        },
      })
    );

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" ? result.error.code : null).toBe("unexpected_attribute");
  });

  it("rejects invalid JSON", () => {
    const result = parseFylloActionNode(
      actionNode({
        content: '{"title":',
      })
    );

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" ? result.error.code : null).toBe("invalid_json");
  });

  it("rejects payloads that fail the schema", () => {
    const result = parseFylloActionNode(
      actionNode({
        content: '{"title":""}',
      })
    );

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" ? result.error.code : null).toBe("invalid_payload");
  });

  it("rejects unknown payload fields", () => {
    const result = parseFylloActionNode(
      actionNode({
        content: '{"title":"补齐错误处理","confirmLabel":"创建"}',
      })
    );

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" ? result.error.code : null).toBe("invalid_payload");
  });
});
