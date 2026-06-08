# 快速开始

## 安装桌面端

从 GitHub Releases 下载对应平台的安装包：

[下载 FylloCode](https://github.com/Fioooooooo/FylloCode/releases)

FylloCode 是桌面应用，适合直接打开本地代码库工作。当前新版本提示会引导用户打开 Release 页面下载安装包，不是后台自动更新。

## 打开项目

启动 FylloCode 后，选择一个本地代码库作为项目。推荐先从一个已经有明确工程规范的项目开始，这样 `fyllo-specs` 和 `fyllo-skills` 能更好地发挥作用。

如果项目还没有 OpenSpec 结构，FylloCode 在创建 proposal 时会补齐最小结构，包括：

- `openspec/config.yaml`
- `openspec/specs/`
- `openspec/changes/archive/`

## 安装或识别 Agent

进入设置中的 ACP Agents 页面，安装或识别可用的 Coding Agent。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/acp-registry.png" alt="ACP Agents 页面截图" />
</figure>

FylloCode 通过 Agent Client Protocol 接入不同 Agent。Agent 会按 `native`、`adapter`、`bridge` 三类展示，分类含义见 [ACP Agent 分类](/reference/acp-agent-kind)。

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

## 进入 Proposal

当任务意图清晰后，让 Agent 进入 proposal 创建流程。Proposal 通常会生成四类产物：

| 产物 | 作用 |
| --- | --- |
| `proposal.md` | 说明背景、新增能力、变更能力和受影响模块 |
| `design.md` | 记录目标、非目标、关键决策和被放弃方案 |
| `specs` | 抽取并回写本次变更涉及的项目规范 |
| `tasks.md` | 以文件和函数为维度拆分执行任务和验收标准 |

## 执行 Apply 与 Archive

Proposal 评审通过后，Apply 阶段按 `tasks.md` 执行实现。实现完成后进入 Archive，把代码变更范围、决策上下文、spec 更新和 guidelines 演进结果归档。

建议第一次使用时选择小范围变更，完整走一遍 Task → Proposal → Apply → Archive。这样能更快理解 FylloCode 的价值，也能暴露团队现有规范中不够清晰的部分。
