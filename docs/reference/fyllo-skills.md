# fyllo-skills MCP

`fyllo-skills` 是 FylloCode 内置的 MCP server。目前它只提供一个 tool：`guidelines`。

## guidelines tool

`guidelines` 用于维护和读取项目 guidelines。它有两个模式：

| mode | 返回内容 | 是否修改文件 |
| --- | --- | --- |
| `write` | guideline 编写契约，包含项目规范文件结构和维护规则 | 否 |
| `read` | 扫描当前项目 `guidelines/**/*.md` 后返回 JSON 列表 | 否 |

`write` 模式不会直接生成或覆盖文件。它返回的是编写 guidelines 时应遵守的契约，具体修改仍由 Agent 根据项目事实完成。

## 推荐文件结构

FylloCode 项目中的 guideline 体系通常包括：

- 根目录 `AGENTS.md`：Agent 工作时的入口说明
- `guidelines/*.md`：按主题拆分的详细规范

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

`guidelines` 的 `read` 模式会解析 guideline 文件顶部的 YAML frontmatter。

推荐字段：

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

没有 frontmatter 的文件也会被返回。frontmatter 解析失败时，条目会包含 `parseError`。

## 适用场景

`fyllo-skills` 解决的是团队工程知识如何持续沉淀的问题。每次任务后，Agent 可以把新形成的约定、踩过的坑和边界规则更新到 guidelines 中，让后续会话从最新规则开始。
