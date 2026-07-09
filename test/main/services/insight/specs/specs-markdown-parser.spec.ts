import { describe, expect, it } from "vitest";
import { parseSpecMarkdown } from "@main/services/insight/specs/specs-markdown-parser";

const UPDATED_AT = "2026-06-25T08:00:00.000Z";

describe("specs-markdown-parser", () => {
  it("extracts purpose, requirements, scenarios, and skips the top-level title", () => {
    const item = parseSpecMarkdown(
      "project-overview",
      "openspec/specs/project-overview/spec.md",
      [
        "# Project Overview",
        "",
        "## Purpose",
        "定义项目概览页的数据聚合。",
        "",
        "## Requirements",
        "### Requirement: 概览数据聚合通道",
        "系统 SHALL 提供 `insight:overview:getProjectOverview` IPC 通道。",
        "",
        "#### Scenario: 成功返回完整概览",
        "- **WHEN** renderer 以有效 `projectId` 调用 IPC",
        "- **THEN** 返回 `{ ok: true }`",
        "",
        "#### Scenario: projectId 无法解析",
        "- **WHEN** 传入无效 `projectId`",
        "- **THEN** 返回 `{ ok: false }`",
      ].join("\n"),
      UPDATED_AT
    );

    expect(item).toMatchObject({
      id: "project-overview",
      purpose: "定义项目概览页的数据聚合。",
      sourcePath: "openspec/specs/project-overview/spec.md",
      updatedAt: UPDATED_AT,
      requirementsCount: 1,
      scenariosCount: 2,
    });
    expect(item.purpose).not.toContain("Project Overview");
    expect(item.requirementGroups).toEqual([
      {
        title: "概览数据聚合通道",
        body: "系统 SHALL 提供 `insight:overview:getProjectOverview` IPC 通道。",
        scenarios: [
          {
            title: "成功返回完整概览",
            body: [
              "- **WHEN** renderer 以有效 `projectId` 调用 IPC",
              "- **THEN** 返回 `{ ok: true }`",
            ].join("\n"),
          },
          {
            title: "projectId 无法解析",
            body: ["- **WHEN** 传入无效 `projectId`", "- **THEN** 返回 `{ ok: false }`"].join("\n"),
          },
        ],
      },
    ]);
  });

  it("supports Chinese requirement and scenario headings", () => {
    const item = parseSpecMarkdown(
      "workflow-templates",
      "openspec/specs/workflow-templates/spec.md",
      [
        "# Workflow Templates",
        "",
        "## Purpose",
        "定义工作流模板。",
        "",
        "## Requirements",
        "### 要求：模板列表展示",
        "系统 SHALL 展示可用模板。",
        "",
        "#### 场景：展示内置模板",
        "- **WHEN** 用户进入工作流页面",
        "- **THEN** 页面展示内置模板",
      ].join("\n"),
      UPDATED_AT
    );

    expect(item.requirementGroups[0]).toEqual({
      title: "模板列表展示",
      body: "系统 SHALL 展示可用模板。",
      scenarios: [
        {
          title: "展示内置模板",
          body: "- **WHEN** 用户进入工作流页面\n- **THEN** 页面展示内置模板",
        },
      ],
    });
  });

  it("does not return title, family, familyLabel, or anchors fields", () => {
    const item = parseSpecMarkdown(
      "chat-interface",
      "openspec/specs/chat-interface/spec.md",
      [
        "# Chat Interface",
        "",
        "## Purpose",
        "定义 Chat 交互。",
        "",
        "### Requirement: 消息流渲染",
        "系统 SHALL 渲染消息流。",
      ].join("\n"),
      UPDATED_AT
    ) as Record<string, unknown>;

    expect(item).not.toHaveProperty("title");
    expect(item).not.toHaveProperty("family");
    expect(item).not.toHaveProperty("familyLabel");
    expect(item).not.toHaveProperty("anchors");
  });
});
