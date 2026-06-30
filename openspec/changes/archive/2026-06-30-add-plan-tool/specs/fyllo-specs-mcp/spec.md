## MODIFIED Requirements

### Requirement: MCP server 注册四个 tool

`fyllo-specs` MCP server SHALL 通过 `@modelcontextprotocol/sdk` 注册且仅注册以下五个 tool，tool name 与 workflow 语义一一对应：

| Tool name         | 作用                                                        |
| ----------------- | ----------------------------------------------------------- |
| `explore`         | 进入探索模式，帮助用户思考问题或调研代码                    |
| `create-plan`     | 为当前 chat session 创建轻量 plan 文档骨架                  |
| `create-proposal` | 创建 change 并生成 proposal / design / specs / tasks 四件套 |
| `apply-change`    | 读取指定 change 的 artifacts，按 tasks 推进实现             |
| `archive-change`  | 完成归档动作，将 change 目录移入 archive                    |

#### Scenario: tool 列表

- **WHEN** MCP client 调用 `tools/list`
- **THEN** 返回数组长度等于 5
- **AND** tool name 精确为 `explore`、`create-plan`、`create-proposal`、`apply-change`、`archive-change`

### Requirement: tool prompt 正文以独立 md 文件维护

每个 tool 的 prompt 正文 SHALL 存放在 `src/mcp-servers/fyllo-specs/src/tools/instructions/<tool-name>.md`。TypeScript 代码 SHALL 不内嵌 prompt 文本 literal，只通过统一的 `loadPrompt(id)` 读取。构建阶段 SHALL 通过 esbuild `text` loader 将 md 内容内联进产物，最终产物为单文件 JS，无外部资源依赖。

#### Scenario: 五个 prompt md 文件存在

- **WHEN** 检查 `src/mcp-servers/fyllo-specs/src/tools/instructions/`
- **THEN** 存在且仅存在 `explore.md`、`create-plan.md`、`create-proposal.md`、`apply-change.md`、`archive-change.md` 五个文件

#### Scenario: 代码不内嵌 prompt literal

- **WHEN** 在 `src/mcp-servers/fyllo-specs/src/tools/` 下搜索 tool instruction 开头短语
- **THEN** 不存在 TypeScript 文件包含这些 literal
- **AND** 所有 prompt 内容经由 `loadPrompt(id)` 动态加载

### Requirement: 所有 tool 入参必填 targetPath 并校验合法性

`fyllo-specs` MCP 的 4 个 path-bound tool（`explore` / `create-proposal` / `apply-change` / `archive-change`）SHALL 全部把 `targetPath: string` 设为必填入参（zod schema 中无 `.optional()`、无 `.default(...)`）。

工具内部 SHALL 在执行任何 fs 副作用之前对 `targetPath` 进行合法性校验：

1. **绝对路径**：`path.isAbsolute(targetPath)` 必须为 `true`。
2. **是 main repo 的合法 worktree**：通过 `child_process.spawnSync("git", ["-C", FYLLO_PROJECT_PATH, "worktree", "list", "--porcelain"], { encoding: "utf8" })` 获取主仓库下所有已注册 worktree 的绝对路径集合；`path.resolve(targetPath)` 必须出现在该集合中。
3. **non-git 项目兜底**：若 `git worktree list` 子进程退出码非 0，SHALL 退化为 `path.resolve(targetPath) === path.resolve(FYLLO_PROJECT_PATH)` 即合法。

校验失败时 tool SHALL：

- 不创建 plan、不创建 change、不修改任何文件、不调用任何 git 子进程（除合法性校验本身的 `git worktree list`）。
- 在 `state.errors` 中追加 `{ type: "InvalidTargetPath", message }` 条目，message 中携带原始 `git worktree list --porcelain` stdout 供 agent 诊断。
- 仍然按 `runTool` 约定返回 `<tool_instruction>` + `<state>` 双段文本。

工具内部 projectRoot SHALL 取自 `path.resolve(input.targetPath)`，不再从 `resolveProjectRoot()`（`FYLLO_PROJECT_PATH` env）兜底。

#### Scenario: 4 个 path-bound tool 都拦截缺省 targetPath

- **WHEN** MCP client 调用 `explore` / `create-proposal` / `apply-change` / `archive-change` 任一，未传 `targetPath`
- **THEN** MCP SDK 在 zod schema 层拦截并返回 `isError: true`
- **AND** error code 等于 `InvalidParams`
- **AND** tool handler 不执行

#### Scenario: targetPath 非绝对路径返回 InvalidTargetPath

- **WHEN** MCP client 调用任一 tool 传入相对路径如 `targetPath: "./.worktrees/foo"`
- **THEN** 响应仍含 `<tool_instruction>` 与 `<state>` 双段
- **AND** `state.errors` 包含 `{ type: "InvalidTargetPath", message }`
- **AND** message 文本说明 targetPath 必须是绝对路径
- **AND** 不调用 git 子进程
- **AND** 不修改任何文件

## ADDED Requirements

### Requirement: create-plan tool 返回 state

`create-plan` tool SHALL 仅接收参数 `{ goal: string, slug: string }`。`goal` 与 `slug` SHALL 为非空字符串。tool schema SHALL NOT 暴露 `targetPath`、workspace path、local filesystem path 或 `includeInstruction` 入参。

`slug` SHALL 是不带日期前缀的 kebab-case 片段，匹配 `^[a-z0-9][a-z0-9-]*$`。tool SHALL 使用当前日期生成完整 slug：`yyyy-MM-dd-<slug>`。

tool SHALL 要求运行环境存在：

- `FYLLO_PROJECT_DATA_DIR`：当前项目数据目录。
- `FYLLO_SESSION_ID`：当前 Fyllo chat session id。

任一缺失或为空时，tool SHALL 不创建 plan 文件，并通过 `runTool` 返回包含 `state.errors` 的响应。

当入参和 env 均合法时，tool SHALL：

1. 在 `<FYLLO_PROJECT_DATA_DIR>/sessions/<FYLLO_SESSION_ID>/plans/` 下创建 `<fullSlug>.md`。
2. 写入 plan frontmatter 与六个固定 heading 骨架。
3. 向 `FYLLO_MCP_EVENT_DIR` 写出 `create-plan` MCP 事件（若事件 env 齐备）。
4. 返回 state，成功时 state SHALL 只包含 `planPath`，不得包含 `slug`、`goal`、`sessionId` 或其他非必要字段。

`create-plan` 响应 SHALL 总是包含 `<tool_instruction>` 与 `<state>` 双段文本；不得提供关闭 instruction 的输入参数。

返回的 `planPath` 仅供 Agent 写入 plan 文件，SHALL NOT 被放入 `<fyllo-action type="plan.create">` payload。

#### Scenario: create-plan 成功创建 plan

- **WHEN** MCP client 调用 `create-plan`，传入 `goal` 与 `slug = "refactor-chat-store"`
- **AND** `FYLLO_PROJECT_DATA_DIR` 与 `FYLLO_SESSION_ID = "sess-1"` 均存在
- **THEN** tool 创建 `<FYLLO_PROJECT_DATA_DIR>/sessions/sess-1/plans/<yyyy-MM-dd-refactor-chat-store>.md`
- **AND** state 只返回 `planPath`
- **AND** 响应仍包含 `<tool_instruction>` 与 `<state>` 双段

#### Scenario: create-plan 不接受路径入参

- **WHEN** MCP client 调用 `create-plan` 并传入 `targetPath` 或 `includeInstruction`
- **THEN** MCP SDK 在 zod schema 层拦截并返回 `isError: true`
- **AND** tool handler 不执行

#### Scenario: 缺少 session env 时不创建 plan

- **WHEN** MCP client 调用 `create-plan`
- **AND** `FYLLO_SESSION_ID` 缺失或为空
- **THEN** state.errors 包含说明缺少 session id 的错误
- **AND** 不创建任何 plan 文件

#### Scenario: plan action payload 不包含 planPath

- **WHEN** `create-plan` 返回 state.planPath
- **THEN** tool instruction SHALL 指示 Agent 只把 `slug` 与 `goal` 放入 `plan.create` payload
- **AND** tool instruction SHALL 明确禁止把 `planPath` 放入 Fyllo action payload
