---
sidebar:
  group: 参考
  order: 20
---

# fyllo-specs MCP

`fyllo-specs` 是 FylloCode 内置的 MCP server。它最初只是对 OpenSpec CLI 的简单封装，之后陆续加入了 linked worktree 管理，再后来加入了 `create-plan`，让 [三线工作方式](/docs/guide/workflow) 中的 Plan 路径也由这个 server 承载。

## 工具列表

`fyllo-specs` 注册五个 tool：

| Tool | 作用 |
| --- | --- |
| `explore` | 进入探索模式，读取项目规范和活跃 change 状态 |
| `create-plan` | 创建会话级 plan，用于不改变行为契约的探索性或架构性工作 |
| `create-proposal` | 创建 change，并生成 proposal、design、specs、tasks 四件套 |
| `apply-change` | 读取指定 change 的 artifacts，按 tasks 推进实现 |
| `archive-change` | 完成归档动作，将 change 移入 archive，并处理 workspace finalization |

`create-plan` 和 `create-proposal` 分别对应 [三线工作方式](/docs/guide/workflow) 里的 Plan 与 Proposal 路径；直接实现不调用这两个 tool 中的任何一个。

## 响应形态

默认情况下，tool 返回的文本包含两段内容：

- `<tool_instruction>`：该工具对应的工作流指令
- `<state>`：当前项目或 change 状态的 JSON

当传入 `includeInstruction: false` 时，只返回 JSON state。首次调用时不建议关闭 instruction，因为 instruction 是当前工具行为契约的一部分。

## create-plan

`create-plan` 接受两个输入字段：

| 字段 | 说明 |
| --- | --- |
| `goal` | 一句话说明这份 plan 要达成什么 |
| `slug` | kebab-case 短标识，不能带日期前缀，工具会自动加上 `yyyy-MM-dd-` 前缀 |

plan 文档以 `<projectDataDir>/sessions/<sessionId>/plans/<yyyy-MM-dd-slug>.md` 路径写入，属于当前会话，不写入项目仓库，也不创建 linked worktree。工具只负责生成带 frontmatter 和标题骨架的模板文件；plan 正文由 Agent 调研后写入。

如果调研过程中发现改动会影响需求、公开 API、schema、协议、持久化格式、用户可见行为或职责边界，应当停止完善这份 plan，改为调用 `create-proposal`，而不是把 plan 写完再另起 proposal。

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

已有 `openspec/config.yaml` 视为项目自有配置并保持原样，不会被自动补写。只有首次创建该文件时才会写入默认 guidelines task 规则；无论配置文件内容如何，`create-proposal` 返回的当前 instruction 都会要求 Agent 在编写 `tasks.md` 时直接决定是否需要具体的 guideline 更新任务。

## Bundled Transport 与上下文

在 FylloCode 应用内，`fyllo-specs` 默认由主进程以应用级 bundled MCP host 托管。声明 HTTP MCP 能力的 ACP Agent 会连接稳定的 loopback proxy；同一应用运行中的不同 Agent 和 session 复用后端进程，每个请求通过 bearer token 鉴权，并使用独立的项目路径、项目数据目录、MCP event 目录和可选 session ID 上下文。

HTTP 后端端口只对主进程可见，后端重启不会改变已提供给 Agent 的 proxy URL。Agent 不支持 HTTP、目标后端未就绪或 HTTP host 不可用时，FylloCode 会为该 server 回退到原有 stdio transport，tool 名称、输入、输出、错误语义和存储位置不变。设置 `FYLLO_DISABLE_BUNDLED_MCP=1` 会同时禁用 HTTP host 和 stdio spec 注入。

## 使用边界

`fyllo-specs` 面向 Agent 工作流，不是通用项目管理 API。它的价值在于把项目规范、变更产物和执行阶段组织成 Agent 可遵守的流程。
