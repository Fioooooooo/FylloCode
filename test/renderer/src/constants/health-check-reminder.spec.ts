import { describe, expect, it } from "vitest";
import { buildHealthCheckReminder } from "@renderer/constants/health-check-reminder";
import type { ProjectInfo } from "@shared/types/project";

const project: ProjectInfo = {
  id: "project-1",
  name: "Project 1",
  path: "/tmp/project-1",
  metaPath: "/tmp/fyllocode/data/projects/project-1/meta.json",
  createdAt: new Date("2026-04-30T08:00:00.000Z"),
  lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
};

describe("buildHealthCheckReminder", () => {
  it("renders the fixed four sections with project paths injected", () => {
    const reminder = buildHealthCheckReminder(project);

    expect(reminder.trim().startsWith("<system-reminder>")).toBe(true);
    expect(reminder.trim().endsWith("</system-reminder>")).toBe(true);
    expect(reminder.match(/^## .+$/gm)).toEqual([
      "## 你的角色",
      "## 评分规范",
      "## 工作流",
      "## proposal 输出契约",
    ]);
    expect(reminder).toContain(project.path);
    expect(reminder).toContain(project.metaPath);
    expect(reminder).not.toContain("{projectPath}");
    expect(reminder).not.toContain("{metaPath}");
  });

  it("includes the ten scoring dimensions and anti-gaming principles", () => {
    const reminder = buildHealthCheckReminder(project);

    for (const dimension of [
      "类型检查 strict",
      "Linter 规则达到生态推荐基线",
      "Formatter 已配置且使用社区主流配置",
      "启用语义或类型感知规则",
      "Test runner 已配置",
      "Test 命令真实运行测试套件且失败会以非 0 退出",
      "Coverage 阈值合理",
      "Git hooks 工具已配置且真实安装",
      "pre-commit hook 真实触发检查命令",
      "CI 配置真实运行 lint + test 且失败阻断",
    ]) {
      expect(reminder).toContain(dimension);
    }

    for (const principle of [
      "配置存在 ≠ 得分",
      "不限定工具与语言",
      "拿不准就不给分",
      "下列反面示例自动判 0 分",
      "每个维度的得分必须附判定理由",
    ]) {
      expect(reminder).toContain(principle);
    }
  });
});
