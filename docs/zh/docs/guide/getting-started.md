---
sidebar:
  group: 指南
  order: 30
---

# 快速开始

## 安装桌面端

从 GitHub Releases 下载对应平台的安装包：

[下载 FylloCode](https://github.com/Fioooooooo/FylloCode/releases)

FylloCode 是桌面应用，适合直接打开本地代码库工作。当前新版本提示会引导用户打开 Release 页面下载安装包，不是后台自动更新。

## 打开 Project 或 Workspace

启动 FylloCode 后，在 Launcher 中选择一个本地代码库作为 Project，也可以把多个 Project 组织到同一个 Workspace 中。关于“一个窗口、多个 Project、一个 Agent 上下文”的使用方式，见[多根 Workspace](/docs/features/multi-root-workspace)。推荐先从一个已经有明确工程规范的 Project 开始，这样 `fyllo-specs` 和 `fyllo-cortex` 能更好地发挥作用。

如果项目还没有 OpenSpec 结构，FylloCode 在创建 proposal 时会补齐最小结构，包括：

- `openspec/config.yaml`
- `openspec/specs/`
- `openspec/changes/archive/`

## 安装或识别 Agent

进入设置中的 ACP Agents 页面，安装或识别可用的 Coding Agent。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/acp-registry.png" alt="ACP Agents 页面截图" />
</figure>

FylloCode 通过 Agent Client Protocol 接入不同 Agent。Agent 会按 `native`、`adapter`、`bridge` 三类展示，分类含义见 [ACP Agent 分类](/docs/reference/acp-agent-kind)。

## 创建 Task

进入任务看板，新建本地任务或从已接入的研发系统中读取任务。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/task.png" alt="任务看板截图" />
</figure>

一个好的 Task 应该至少包含：

- 任务背景
- 影响范围
- 明确的约束
- 可验证的验收标准
- 已知风险或不确定点

## 在对话中收敛方案

在任务上下文中打开对话，让 Agent 分析需求、检索代码佐证、引导你权衡取舍，一起把方案和决策定下来，再进入 Proposal。被采纳与被放弃的思路都会随这条主线留存。

## 进入 Proposal

方案在对话中确认后，接下来该走[直接实现、Plan 还是 Proposal](/docs/guide/change-paths)，取决于这次改动是否会影响公开 API、schema、协议、持久化格式、用户可见行为或职责边界。第一次使用建议选择一个会触发 Proposal 的改动，完整体验评审和归档的价值。

让 Agent 进入 proposal 创建流程后，Proposal 通常会生成四类产物：

| 产物 | 作用 |
| --- | --- |
| `proposal.md` | 说明背景、新增能力、变更能力和受影响模块 |
| `design.md` | 记录目标、非目标、关键决策和被放弃方案 |
| `specs` | 抽取并回写本次变更涉及的项目规范 |
| `tasks.md` | 以文件和函数为维度拆分执行任务和验收标准 |

## 执行 Apply 与 Archive

Proposal 评审通过后，按 `tasks.md` 执行实现；实现完成后归档，把代码变更范围、决策上下文、spec 更新和 guidelines 演进结果沉淀下来，作为下一次任务的背景知识。

建议第一次使用时选择小范围变更，完整走一遍 Task → Chat → Proposal → Apply & Archive。这样能更快理解 FylloCode 的价值，也能暴露 Workspace 中各 Project 现有规范不够清晰的部分。
