---
sidebar:
  group: 参考
  order: 20
---

# fyllo-specs MCP

`fyllo-specs` 是 FylloCode 内置的 MCP server，围绕 OpenSpec 提供项目规范探索、Proposal 创建、Apply 执行和 Archive 归档能力。

## 工具列表

`fyllo-specs` 只注册四个 tool：

| Tool | 作用 |
| --- | --- |
| `explore` | 进入探索模式，读取项目规范和活跃 change 状态 |
| `create-proposal` | 创建 change，并生成 proposal、design、specs、tasks 四件套 |
| `apply-change` | 读取指定 change 的 artifacts，按 tasks 推进实现 |
| `archive-change` | 完成归档动作，将 change 移入 archive，并处理 workspace finalization |

## 响应形态

默认情况下，tool 返回的文本包含两段内容：

- `<tool_instruction>`：该工具对应的工作流指令
- `<state>`：当前项目或 change 状态的 JSON

当传入 `includeInstruction: false` 时，只返回 JSON state。首次调用时不建议关闭 instruction，因为 instruction 是当前工具行为契约的一部分。

## workspaceMode

`create-proposal` 支持 `workspaceMode`：

| 值 | 说明 |
| --- | --- |
| `linked` | 默认模式。若目标是 git 项目，创建或复用 `.worktrees/<changeName>` linked worktree |
| `main` | 直接在主工作区创建 proposal，不创建 linked worktree |

如果目标路径不是 git 项目，`linked` 模式会回退到 `main` 工作区，并在 state warnings 中说明原因。

## OpenSpec 初始化

当目标项目缺少最小 OpenSpec 结构时，`create-proposal` 会补齐：

- `openspec/config.yaml`
- `openspec/specs/`
- `openspec/changes/archive/`

已有 `openspec/config.yaml` 会被保留。若缺少默认 guidelines 评估规则，工具会在保留其他字段的前提下追加该规则。

## 使用边界

`fyllo-specs` 面向 Agent 工作流，不是通用项目管理 API。它的价值在于把项目规范、变更产物和执行阶段组织成 Agent 可遵守的流程。
