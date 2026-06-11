# 贡献指南

感谢你对 FylloCode 的兴趣。这个页面说明如何在本地搭建开发环境、如何提交代码，以及参与贡献时需要注意的基本约定。

## 开发环境

依赖要求：

- Node.js 22+
- pnpm 10+

本地启动：

```bash
git clone https://github.com/Fioooooooo/FylloCode.git
cd FylloCode
pnpm install
pnpm dev
```

## 推荐使用打包版开发

FylloCode 自身也在用 FylloCode 开发。参与贡献时，推荐使用 Releases 中的打包版本打开 FylloCode 仓库，而不是用 `pnpm dev` 启动的版本来驱动 Apply。

原因是开发模式有热重载。Apply 阶段修改源码后，热重载可能打断正在进行的工作流。打包版本没有这个问题。

推荐流程：

1. 下载最新 Release
2. 打开 FylloCode 仓库作为项目
3. （可选）在 Task 中描述你要做的改动
4. 在对话里和 Agent 收敛方案，再走 Proposal → Apply & Archive
5. 回到代码仓库检查 diff 和验证结果

## 提交流程

小改动可以直接开 PR，例如：

- typo
- 文档修正
- 小 bug
- 测试补充

大改动建议先开 Issue 讨论，例如：

- 新功能
- 架构调整
- 行为变化
- IPC、共享类型或存储格式变化
- 大范围重构

PR 需要保持聚焦，标题清楚说明改了什么。如果影响用户可见行为，需要在 PR 描述中说明影响范围。

## Issue 规范

报 bug 时请说明：

- 复现步骤
- 实际行为
- 期望行为
- 系统信息和 FylloCode 版本

提需求时请描述具体场景和遇到的问题，不需要一开始就给出完整方案。

## 代码风格

提交前至少运行：

```bash
pnpm lint
pnpm typecheck
```

commit message 格式：

```text
type(scope): summary

- 可选的补充说明，用 bullet 列出关键变更点
```

常用 type：

- `feat`
- `fix`
- `refactor`
- `docs`
- `chore`
- `perf`
- `test`

scope 对应模块或功能区域，例如 `proposal`、`specs`、`archive`、`worktree`、`chat`、`acp`。

## 许可证

FylloCode 使用 [AGPL-3.0](https://github.com/Fioooooooo/FylloCode/blob/main/LICENSE) 许可证。
