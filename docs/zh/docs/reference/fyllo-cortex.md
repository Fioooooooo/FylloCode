---
sidebar:
  group: 参考
  order: 30
---

# fyllo-cortex MCP

`fyllo-cortex` 是 FylloCode 内置的 MCP server。目前它提供两个 tool：

| Tool | 作用 |
| --- | --- |
| `guidelines` | 维护项目工程约定，让后续 Agent 会话能读取当前规则 |
| `lineage` | 查询代码、commit 或 proposal 背后的任务、会话和设计决策脉络 |

## guidelines tool

`guidelines` 用于维护项目 guidelines。正常读取 guidelines 的路径不是调用 tool，而是：

1. FylloCode 在新的 Chat / Apply ACP session 启动时扫描当前工作区的 `guidelines/**/*.md`
2. 将每个文件的 frontmatter 组成 `<guidelines>` 索引注入 system reminder
3. Agent 根据索引中的 `path` 直接读取相关 guideline 全文

Archive 阶段不会注入 `<guidelines>` 索引，但会在归档前要求 Agent 检查本次变更是否应该更新 guidelines。

当前 tool 有三个维护模式：

| mode | 返回内容 | 是否修改文件 |
| --- | --- | --- |
| `init` | 为尚无 guidelines 的项目返回初始化指令和当前仓库状态 | 否 |
| `create` | 为一个未沉淀的新约定返回创建指令、现有索引和 `AGENTS.md` 状态 | 否 |
| `update` | 为一个已有 guideline 返回修复指令、目标文件状态和当前索引 | 否 |

tool 不会直接生成或覆盖文件。它返回的是维护 guidelines 时应遵守的 `tool_instruction` 和 `state`，具体修改仍由 Agent 根据仓库事实完成。

不要用 `guidelines` tool 重新读取 guideline 索引；会话中的 `<guidelines>` 块才是读取入口。只有在初始化、创建或修复 guideline 时才调用该 tool。

## 推荐文件结构

FylloCode 项目中的 guideline 体系通常包括：

- 根目录 `AGENTS.md`：Agent 工作时的入口说明
- `guidelines/**/*.md`：按主题拆分的详细规范，可按目录继续分组

常见主题包括：

- Architecture
- CodeStyle
- Testing
- DataModel
- IPC
- RendererProcess
- MainProcess
- Build
- DeveloperWorkflow
- Domain

## frontmatter

FylloCode 会解析 guideline 文件顶部的 YAML frontmatter 来构建 `<guidelines>` 索引。

每个 guideline 文档必须以这些字段开头：

```yaml
---
name: Architecture
description: 系统架构、目录边界与依赖方向
keywords: [architecture, electron, ipc]
---
```

返回条目包含：

- `path`
- `name`
- `description`
- `keywords`
- `parseError`（仅 frontmatter 解析失败或文件读取失败时出现）

没有 frontmatter 的文件仍会被返回，`name` 会退回到文件名；但推荐修复为完整 frontmatter，否则 Agent 很难只通过索引判断是否需要打开该文档。

## 触发位置

guidelines 不只由 `fyllo-cortex.guidelines` tool 触发。FylloCode 会在多个位置把 guideline 维护纳入工作流：

- **Chat**：system reminder 注入 `<guidelines>` 索引；创建 Proposal 前要求 Agent 考虑是否需要新增或更新 guideline；直接实现或 Plan 实现完成后也要做同样检查。
- **Proposal 创建**：`fyllo-specs` 初始化或复用 OpenSpec config 时会追加默认 tasks 规则，要求 `tasks.md` 评估本次变更是否应更新 local repository guidelines。
- **Apply**：改代码前必须读取相关 guideline；实现中发现 guideline 缺失、陈旧或与仓库事实冲突时，调用 `guidelines` tool 维护。
- **Archive**：归档前再次检查已完成变更是否改变了命令、架构、测试、工作流、数据契约或项目约定。
- **Project Health Check**：guideline 健康检查不计入健康分，但会直接通过 `init` / `create` / `update` 处理缺失、损坏或陈旧的 guideline，不走 Proposal。
- **Project Overview**：概览页展示 guidelines 数量、最近更新时间，以及 git 历史中的 guideline 演化记录。

## 会话注入细节

Chat 与 Apply 的 `<guidelines>` 索引来自当前 workspace：

- 如果当前阶段有 linked worktree，优先扫描 worktree 下的 `guidelines/`
- 否则扫描项目主目录下的 `guidelines/`
- 如果没有 `guidelines/` 或没有 Markdown 文件，就不注入 `<guidelines>` 块
- frontmatter 中的尖括号会被转义，避免用户编写的元数据提前关闭 `<guidelines>` 块

## lineage tool

`lineage` 用于查询既有代码背后的设计历史。它返回的是 FylloCode lineage subject 的投影，包含任务摘要、Chat session、proposal、plan、commit hash、proposal 路径和当前 proposal 状态。

常见使用场景是用户问“这段代码为什么这样写”“这个 commit 背后的任务是什么”“这个 proposal 后来落地了吗”。这类问题仅靠 git commit message 往往不够，`lineage` 会把代码变更追溯回任务、对话和 OpenSpec artifacts。

当前有三个查询模式：

| mode | 输入 | 返回 |
| --- | --- | --- |
| `trace-file` | `filePath`，可选 `lineRange` | 查找触碰该文件的 commits，并返回匹配到的 lineage entries；这是回答“为什么这个文件这样写”的首选入口 |
| `trace-commit` | `commitHash` | 返回该 commit 对应的 lineage entry |
| `trace-proposal` | `changeId` | 返回该 OpenSpec change 对应的 lineage entry |

当没有匹配结果或项目缺少 lineage 数据时，tool 返回 `null` 或空数组。它只读取项目数据和 git 历史，不修改文件。

## 适用场景

`fyllo-cortex` 解决的是团队工程知识如何持续沉淀和重新取用的问题。`guidelines` 让新形成的约定、踩过的坑和边界规则进入后续会话；`lineage` 让后续 Agent 能从代码、commit 或 proposal 反查当时的任务和决策依据。
