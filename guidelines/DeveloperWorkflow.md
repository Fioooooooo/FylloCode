---
name: DeveloperWorkflow
description: 本地开发流程、常用命令、提交前检查与 OpenSpec 使用边界
keywords: [workflow, openspec, commands, pre-commit, review]
---

# DeveloperWorkflow

## Purpose

定义 FylloCode 的本地开发流程、常用命令、提交前检查，以及何时必须查阅 OpenSpec 或创建 change。任何涉及开始一项任务、判断是否需要 proposal、执行验证命令或整理仓库 guideline 的工作，都必须先阅读本文档。

## Applicability

- 适用于整个仓库。
- 适用于 `AGENTS.md`、`package.json`、`openspec/specs/**`、`openspec/changes/**`、`simple-git-hooks`、`lint-staged`。
- 不替代具体技术主题 guideline；当任务涉及进程边界、IPC、数据模型、测试或构建时，必须继续查相应专题文档。

## Sources of Truth

- `AGENTS.md`
- `package.json`
- `openspec/specs/**`
- `openspec/changes/**`
- `guidelines/*.md`
- `package.json#simple-git-hooks`
- `package.json#lint-staged`

## Rules

- MUST: 在开始分析、设计、实现、重构、测试或评审前，先阅读与任务相关的现有 guideline，而不是凭记忆行动。
- MUST: 将 `openspec/specs/` 视为功能需求和行为契约的权威来源；当改动涉及已有 capability 时，先读对应 `openspec/specs/<capability>/spec.md`。
- MUST: 当改动会新增、删除或改变用户可见行为、共享类型、IPC 契约、存储格式、默认值、空态/异常态、跨模块职责边界时，先创建 OpenSpec change，再进入实现。
- MUST: 当改动只涉及等价重构、测试补充、注释修正、文案错字、日志或类型标注等不改变外部契约的工作时，可以直接实施，不必单独创建 OpenSpec change。
- MUST: 在无法判断“这是行为变化还是实现变化”时，先查 spec、代码和现有文档；若仍不能确定，再与需求方确认，而不是自行假设。
- MUST: 使用 `pnpm` 命令驱动仓库脚本，不引入额外包管理器。
- MUST: 尊重 pre-commit 流程：提交前至少让会被 `lint-staged` 处理的文件能够通过 Prettier/ESLint。
- SHOULD: 根据改动范围选择最小但充分的验证命令；大多数代码改动至少应跑 `pnpm lint` 与相关测试。
- SHOULD: 将 `pnpm lint` 视为类型感知静态检查入口；它会对 `**/*.{ts,mts,tsx,vue}` 源文件加载 TypeScript project service，因此 lint 失败可能来自 tsconfig 覆盖范围或类型信息解析问题。
- SHOULD: 将 `pnpm test:coverage` 视为带 fail-under 阈值的覆盖率检查入口；当前 aggregate 阈值为 50/40/50/50，低于任一 statements、branches、functions、lines 指标时命令会失败。
- SHOULD: 在修改 guideline 时同步检查 `AGENTS.md` 索引是否仍然准确。
- MAY: 将 ACP、第三方集成协议、历史示例文档放在 `references/`，但这些文档不应替代项目级规则来源。

## Examples

- Good: 改 `project:*` IPC 返回结构前，先查看 `openspec/specs/ipc-*` 与 `openspec/specs/project-*`，必要时先创建 change。
- Good: 补一个 renderer store 的单测时，直接修改测试与实现，不额外创建 OpenSpec proposal。
- Good: 修改 guideline 体系时，同时更新 `AGENTS.md` 索引与 `references/` 目录布局。
- Bad: 不读现有 spec 就直接改变 settings 页的默认 tab、启动路由或 proposal/apply 行为。
- Bad: 把 ACP 消息示例文档当成项目级硬规则，而不先核对真实代码与顶层 guideline。

## Verification

- 本地开发：`pnpm dev`
- 全量类型检查：`pnpm typecheck`
- 静态检查：`pnpm lint`
- 格式化：`pnpm format`
- 全量测试：`pnpm test`
- 覆盖率：`pnpm test:coverage`
- 构建验证：`pnpm build`

## Maintenance

- 当常用命令、OpenSpec 工作方式、pre-commit 规则、仓库 guideline 索引或包管理策略变化时，必须更新本文档。
- 当团队反复纠正同一种“先实现后补 spec”或“没读 guideline 就改边界”的问题时，应把该约束固化到本文档。
- 如果顶层流程规则与具体专题 guideline 冲突，以更窄范围的专题规则为准，并回头修复不一致之处。
