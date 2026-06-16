# fyllo-cortex-mcp 规范

## Purpose

定义内置 `fyllo-cortex` MCP 服务的契约。该服务负责项目 guidelines 工具能力，并作为 FylloCode 未来核心工具的扩展点。

## Requirements

### Requirement: fyllo-cortex MCP 服务注册 guidelines 工具

`fyllo-cortex` MCP 服务 SHALL 作为内置 stdio MCP 服务实现在 `src/mcp-servers/fyllo-cortex/` 下。它 SHALL 注册一个名为 `guidelines` 的工具，用于读取本地 guideline 元数据和返回 guideline 编写契约。

`guidelines` 工具 SHALL 接受 `mode` 字段，取值 SHALL 为 `"read"` 或 `"write"`。该工具 SHALL NOT 接受项目路径、OpenSpec 变更名称或工作区控制参数，例如 `targetPath`、`changeName`、`includeInstruction` 或 `workspaceMode`。

#### Scenario: 工具列表包含 guidelines

- **WHEN** MCP 客户端在 `fyllo-cortex` 上调用 `tools/list`
- **THEN** 返回的工具列表包含名为 `guidelines` 的工具
- **AND** 没有返回工具使用旧 guidelines 服务名称作为命名空间

#### Scenario: guidelines 只接受 mode 输入

- **WHEN** MCP 客户端使用 `{ "mode": "read" }` 或 `{ "mode": "write" }` 调用 `guidelines`
- **THEN** 调用成功
- **AND** 工具不要求传入 `targetPath`、`changeName`、`includeInstruction` 或 `workspaceMode`

### Requirement: guidelines prompt 由 markdown 文件维护

`guidelines` 工具的指令正文 SHALL 维护在 `src/mcp-servers/fyllo-cortex/src/tools/instructions/guidelines.md` 中。TypeScript 代码 SHALL NOT 将指令正文以内联长字符串形式维护。MCP 服务实现 SHALL 通过现有 prompt loader 模式加载 Markdown prompt，使 esbuild 能够沿用现有 `.md` text loader 将其内联。

#### Scenario: prompt 文件存在

- **WHEN** 检查 `src/mcp-servers/fyllo-cortex/src/tools/instructions/`
- **THEN** `guidelines.md` 存在

#### Scenario: 指令正文不嵌入工具代码

- **WHEN** 搜索 `src/mcp-servers/fyllo-cortex/src/` 下的 TypeScript 文件
- **THEN** 项目 guidelines 指令文案没有以长字符串字面量形式重复出现在工具注册代码中
- **AND** `guidelines` 工具使用 markdown prompt loader 生成 write 模式响应

### Requirement: guidelines 指令定义项目 guideline 契约

`mode=write` 返回的 `guidelines.md` 指令正文 SHALL 定义项目 guidelines 文件契约和维护规则。它 SHALL 覆盖：

- 根目录 `AGENTS.md` 作为面向 agent 的仓库入口文件
- `guidelines/*.md` 作为按主题拆分的详细文档
- 根目录 `AGENTS.md` 中聚焦的 `Project Guidelines Index` 小节，并要求 agent 只在本地 guideline 链接缺失或过期时添加该小节
- 推荐的 `guidelines/*.md` 分类体系，覆盖架构、代码风格、测试、数据模型、API、IPC、前端、后端、构建、安全、依赖、工作流和领域规则等常见仓库表面
- 使用稳定章节和 `MUST` / `SHOULD` / `MAY` 规范术语的 guideline 文档格式
- 常见 guideline 文件的主题级内容检查清单
- 基于仓库证据的编写规则
- 当项目约定变化时更新 guidelines 的维护触发条件
- 当本地 guidelines 与更高优先级指令或观察到的仓库事实冲突时的处理规则
- YAML frontmatter 说明，定义推荐的 `name`、`description`、`keywords` 字段，包括放在文档模板顶部的示例，并说明 `mode=read` 会解析这些字段来暴露 guideline 元数据

该指令 SHALL NOT 提及 Fyllo stage 名称或工作流，包括 Chat、Proposal、Apply、Archive、OpenSpec、worktrees、commits、archive、`mcp__fyllo_specs__*` 或 Fyllo proposal tasks。阶段特定编排属于 system-reminder 模板，不属于 `guidelines` 工具指令。

#### Scenario: 指令包含文件契约

- **WHEN** MCP 客户端使用 `{ "mode": "write" }` 调用 `guidelines`
- **THEN** 返回的指令提及根目录 `AGENTS.md`
- **AND** 返回的指令提及 `guidelines/`
- **AND** 返回的指令说明仓库拥有的 guidelines 维护在用户项目中

#### Scenario: 指令包含可复用 guideline 索引和文档模板

- **WHEN** MCP 客户端使用 `{ "mode": "write" }` 调用 `guidelines`
- **THEN** 返回的指令包含 `AGENTS.md` guidelines index 小节
- **AND** 返回的指令告知 agent 不要根据该指令生成或替换完整的 `AGENTS.md` 文档
- **AND** 返回的指令包含推荐 guideline 文件小节
- **AND** 返回的指令包含主题级内容要求
- **AND** 返回的指令提及 `guidelines/Architecture.md`、`guidelines/CodeStyle.md`、`guidelines/Testing.md` 和 `guidelines/DataModel.md`

#### Scenario: 指令与工作流无关

- **WHEN** MCP 客户端使用 `{ "mode": "write" }` 调用 `guidelines`
- **THEN** 返回的指令不包含 `Chat`
- **AND** 返回的指令不包含 `Proposal`
- **AND** 返回的指令不包含 `Apply`
- **AND** 返回的指令不包含 `Archive`
- **AND** 返回的指令不包含 `OpenSpec`
- **AND** 返回的指令不包含 `worktree`
- **AND** 返回的指令不包含 `commit`

### Requirement: fyllo-cortex 拥有独立服务元数据和测试

`fyllo-cortex` SHALL 定义自己的服务名称和版本模块。测试 SHALL 覆盖工具注册以及 `mode=read` 和 `mode=write` 两种模式的响应形状，并且不得依赖 `fyllo-specs` 内部实现。

#### Scenario: 服务元数据使用 fyllo-cortex 名称

- **WHEN** `fyllo-cortex` 启动其 `McpServer`
- **THEN** 服务名称为 `fyllo-cortex`

#### Scenario: 测试验证 guidelines write 响应

- **WHEN** 运行 MCP 服务测试
- **THEN** 测试覆盖使用 `{ "mode": "write" }` 调用 `guidelines` 的场景
- **AND** 测试验证响应包含 `<tool_instruction>` 且不包含 `<state>`

#### Scenario: 测试验证 guidelines read 响应

- **WHEN** 运行 MCP 服务测试
- **THEN** 测试覆盖在 fixture project 中使用 `{ "mode": "read" }` 调用 `guidelines` 的场景
- **AND** 测试验证响应是包含 `guidelines` 数组的 JSON
- **AND** 测试验证包含 frontmatter、缺少 frontmatter 和 frontmatter 格式错误的条目均符合本规范

### Requirement: guidelines 工具返回按 mode 区分的响应

`guidelines` 工具 SHALL 根据 `mode` 输入字段返回不同形状的响应。

当 `mode` 为 `"write"` 时，工具 SHALL 返回 `content: [{ type: "text", text }]`，其中 `text` 包含持有 guideline 编写契约的 `<tool_instruction>...</tool_instruction>` 块。响应 SHALL NOT 包含 `<state>` 块。工具 SHALL NOT 修改任何仓库文件。

当 `mode` 为 `"read"` 时，工具 SHALL 返回 `content: [{ type: "text", text }]`，其中 `text` 是一个 JSON 文档，根字段只有 `guidelines`，其值为 guideline 条目数组。工具 SHALL 在 MCP 服务当前工作目录下递归扫描 `guidelines/**/*.md`，并为每个匹配文件生成一个条目。工具 SHALL NOT 修改任何仓库文件。如果 `guidelines/` 目录不存在，工具 SHALL 返回 `{ "guidelines": [] }` 且不报错。

每个 guideline 条目 SHALL 包含以下字段：

- `path`: 文件相对于项目根目录的 POSIX 路径，例如 `guidelines/Architecture.md`。
- `name`: 当文件 YAML frontmatter 中的 `name` 是非空字符串时使用该值；否则使用文件名主干。
- `description`: 当文件 YAML frontmatter 中的 `description` 是非空字符串时使用该值；否则为 `null`。
- `keywords`: 当文件 YAML frontmatter 中的 `keywords` 是字符串数组时使用该值；否则为 `null`。

当文件没有开头的 `---` frontmatter 分隔符时，条目 SHALL 仍然返回，其中 `description` 和 `keywords` 为 `null`，`name` 为文件名主干。当文件存在 frontmatter 块但 YAML 解析失败，或解析结果不是普通对象时，条目 SHALL 包含额外的可选字段 `parseError`，其值为简短错误信息字符串，并且 `description` 和 `keywords` SHALL 为 `null`。

条目 SHALL 按 `path` 的字典序升序排序。

#### Scenario: write mode 返回指令块

- **WHEN** MCP 客户端使用 `{ "mode": "write" }` 调用 `guidelines`
- **THEN** 响应满足 `content[0].type === "text"`
- **AND** 响应 `content[0].text` 包含 `<tool_instruction>`
- **AND** 响应 `content[0].text` 包含 `</tool_instruction>`
- **AND** 响应 `content[0].text` 不包含 `<state>`

#### Scenario: read mode 返回 guidelines 数组

- **WHEN** MCP 客户端在包含 `guidelines/A.md` 和 `guidelines/B.md` 的项目中使用 `{ "mode": "read" }` 调用 `guidelines`
- **THEN** 响应 `content[0].text` 可解析为 JSON
- **AND** 该 JSON 有根字段 `guidelines`，其值为数组
- **AND** 该数组包含 `path` 值为 `guidelines/A.md` 和 `guidelines/B.md` 的条目
- **AND** 条目按 `path` 升序排序

#### Scenario: read mode 解析 frontmatter 字段

- **WHEN** MCP 客户端使用 `{ "mode": "read" }` 调用 `guidelines`，且某个 guideline 文件在 YAML frontmatter 中声明 `name: "Architecture"`、`description: "system layout"` 和 `keywords: ["electron", "ipc"]`
- **THEN** 对应条目满足 `name === "Architecture"`
- **AND** 该条目满足 `description === "system layout"`
- **AND** 该条目的 `keywords` 与 `["electron", "ipc"]` 深度相等

#### Scenario: read mode 容忍缺失 frontmatter

- **WHEN** MCP 客户端使用 `{ "mode": "read" }` 调用 `guidelines`，且文件 `guidelines/Legacy.md` 不以 `---` 开头
- **THEN** 对应条目满足 `path === "guidelines/Legacy.md"`
- **AND** 该条目满足 `name === "Legacy"`
- **AND** 该条目满足 `description === null`
- **AND** 该条目满足 `keywords === null`
- **AND** 该条目不包含 `parseError`

#### Scenario: read mode 报告 frontmatter 解析失败

- **WHEN** MCP 客户端使用 `{ "mode": "read" }` 调用 `guidelines`，且某个文件的 frontmatter 包含格式错误的 YAML
- **THEN** 对应条目满足 `name === <文件名主干>`
- **AND** 该条目满足 `description === null`
- **AND** 该条目满足 `keywords === null`
- **AND** 该条目的 `parseError` 为非空字符串

#### Scenario: read mode 支持嵌套目录

- **WHEN** MCP 客户端使用 `{ "mode": "read" }` 调用 `guidelines`，且项目包含 `guidelines/src/renderer/Routing.md`
- **THEN** 响应包含满足 `path === "guidelines/src/renderer/Routing.md"` 的条目

#### Scenario: read mode 在 guidelines 目录缺失时返回空数组

- **WHEN** MCP 客户端在没有 `guidelines/` 目录的项目中使用 `{ "mode": "read" }` 调用 `guidelines`
- **THEN** 响应 `content[0].text` 可解析为 JSON
- **AND** 该 JSON 等于 `{ "guidelines": [] }`

### Requirement: fyllo-cortex MCP 服务注册 lineage 工具

`fyllo-cortex` MCP 服务 SHALL 注册一个名为 `lineage` 的工具，用于把主进程已经持久化到项目数据目录的 lineage 以只读方式暴露给 agent 查询。该工具 SHALL 支持按 OpenSpec proposal changeId 回溯，也 SHALL 支持按完整 commit hash 回溯。

`lineage` 工具 SHALL 接受严格的 discriminated union 输入：

- `{ "mode": "trace-proposal", "changeId": "<openspec change id>" }`
- `{ "mode": "trace-commit", "commitHash": "<full commit sha>" }`

`lineage` 工具 SHALL NOT 接受 `targetPath`、`projectPath`、`lineageDir`、`includeInstruction`、`workspaceMode` 或任意未声明字段。工具 SHALL 从环境变量读取路径上下文：`FYLLO_PROJECT_DATA_DIR` 用于定位 FylloCode 项目数据目录，`FYLLO_PROJECT_PATH` 用于读取项目源码目录下的 active OpenSpec change 状态。

#### Scenario: 工具列表包含 lineage

- **WHEN** MCP 客户端在 `fyllo-cortex` 上调用 `tools/list`
- **THEN** 返回的工具列表包含名为 `lineage` 的工具
- **AND** 返回的工具列表仍包含名为 `guidelines` 的工具

#### Scenario: lineage 输入只接受两种 mode

- **WHEN** MCP 客户端使用 `{ "mode": "trace-proposal", "changeId": "add-foo" }` 调用 `lineage`
- **THEN** 输入校验通过
- **WHEN** MCP 客户端使用 `{ "mode": "trace-commit", "commitHash": "abcdef123456" }` 调用 `lineage`
- **THEN** 输入校验通过

#### Scenario: lineage 拒绝未声明字段

- **WHEN** MCP 客户端使用 `{ "mode": "trace-proposal", "changeId": "add-foo", "targetPath": "/repo" }` 调用 `lineage`
- **THEN** 工具调用失败

### Requirement: lineage 工具只读查询项目数据目录中的 lineage index

`lineage` 工具 SHALL 将 `FYLLO_PROJECT_DATA_DIR/lineage/index.json` 作为唯一反查入口。`trace-proposal` SHALL 使用 `index.proposals[changeId]` 查找 `subjectId`；`trace-commit` SHALL 使用 `index.commitHashes[commitHash]` 查找 `subjectId`。命中后，工具 SHALL 读取 `FYLLO_PROJECT_DATA_DIR/lineage/subjects/<subjectId>.json` 并投影响应。

`lineage` 工具 SHALL NOT 修改任何文件。它 SHALL NOT 重建 `index.json`，SHALL NOT 扫描 `subjects/*.json` 作为缺失 index 的兜底，SHALL NOT 调用 Git，SHALL NOT 写入 `LineageProposalLink.commitHash`，SHALL NOT 使用 `FYLLO_MCP_EVENT_DIR` 定位 lineage 数据。

当 `index.json` 缺失、损坏、缺少对应 key、subject 文件缺失或 subject 文件损坏时，工具 SHALL 返回 `content: [{ type: "text", text: "null" }]`，而不是抛出业务错误。缺少 `FYLLO_PROJECT_DATA_DIR` 或 `FYLLO_PROJECT_PATH` 这类必要环境变量时，工具 SHALL 返回工具错误。

#### Scenario: trace-proposal 通过 index.proposals 命中 subject

- **WHEN** `FYLLO_PROJECT_DATA_DIR/lineage/index.json` 包含 `proposals: { "add-foo": "subject-1" }`
- **AND** `FYLLO_PROJECT_DATA_DIR/lineage/subjects/subject-1.json` 是合法 subject
- **AND** MCP 客户端使用 `{ "mode": "trace-proposal", "changeId": "add-foo" }` 调用 `lineage`
- **THEN** 工具返回该 subject 的 lineage DTO

#### Scenario: trace-commit 通过 index.commitHashes 命中 subject

- **WHEN** `FYLLO_PROJECT_DATA_DIR/lineage/index.json` 包含 `commitHashes: { "abcdef123456": "subject-1" }`
- **AND** `FYLLO_PROJECT_DATA_DIR/lineage/subjects/subject-1.json` 是合法 subject
- **AND** MCP 客户端使用 `{ "mode": "trace-commit", "commitHash": "abcdef123456" }` 调用 `lineage`
- **THEN** 工具返回该 subject 的 lineage DTO

#### Scenario: index 缺失时返回 null

- **WHEN** `FYLLO_PROJECT_DATA_DIR/lineage/index.json` 不存在
- **AND** MCP 客户端调用 `lineage`
- **THEN** 工具返回文本 `null`
- **AND** 工具不扫描 `FYLLO_PROJECT_DATA_DIR/lineage/subjects/`

#### Scenario: subject 缺失时返回 null

- **WHEN** `FYLLO_PROJECT_DATA_DIR/lineage/index.json` 将 `add-foo` 映射到 `subject-missing`
- **AND** `FYLLO_PROJECT_DATA_DIR/lineage/subjects/subject-missing.json` 不存在
- **AND** MCP 客户端使用 `{ "mode": "trace-proposal", "changeId": "add-foo" }` 调用 `lineage`
- **THEN** 工具返回文本 `null`

### Requirement: lineage 工具返回固定 DTO

`lineage` 工具命中 subject 后 SHALL 返回 JSON 文档，结构固定为：

```json
{
  "subjectId": "subject-1",
  "origin": "task",
  "task": {
    "ref": "github:42",
    "title": "Task title",
    "description": "Task description",
    "source": "github",
    "url": "https://example.test/task/42"
  },
  "sessions": [
    {
      "sessionId": "sess-1",
      "createdAt": "2026-06-16T00:00:00.000Z",
      "proposals": [
        {
          "changeId": "add-foo",
          "createdAt": "2026-06-16T00:01:00.000Z",
          "commitHash": null,
          "status": "pending"
        }
      ]
    }
  ],
  "createdAt": "2026-06-16T00:00:00.000Z",
  "updatedAt": "2026-06-16T00:01:00.000Z"
}
```

字段投影规则如下：

- `subjectId` SHALL 来自 `Subject.id`。
- `origin` SHALL 来自 `Subject.origin`，只能是 `"task"` 或 `"chat"`。
- 当 `Subject.task` 为 `null` 时，响应 `task` SHALL 为 `null`。
- 当 `Subject.task` 非空时，响应 `task.ref` SHALL 来自 `Subject.task.ref`。
- 响应 `task.title` SHALL 来自 `Subject.task.snapshot.title`。
- 响应 `task.description` SHALL 来自 `Subject.task.snapshot.description.content`。
- 响应 `task.source` SHALL 来自 `Subject.task.snapshot.source`。
- 响应 `task.url` SHALL 从 `Subject.task.snapshot.sourceMeta.url` 提取；缺失时为 `null`。
- `sessions` SHALL 保持 `Subject.links` 的顺序；每个 session 的 `proposals` SHALL 保持对应 `LineageSessionLink.proposals` 的顺序。
- 每个 proposal 的 `commitHash` SHALL 在持久化字段缺失时输出为 `null`。
- `createdAt` 与 `updatedAt` SHALL 来自 subject 或 link/proposal 原始 ISO 字符串，不做格式转换。

#### Scenario: task 起源 subject 投影 task 摘要

- **WHEN** 命中的 subject 满足 `origin === "task"` 且 `task` 非空
- **THEN** 响应 `task.ref`、`task.title`、`task.description`、`task.source` 和 `task.url` 均从 task 快照投影
- **AND** 响应不包含完整 `TaskItem` 快照

#### Scenario: chat 起源且无 task 时返回 task null

- **WHEN** 命中的 subject 满足 `origin === "chat"` 且 `task === null`
- **THEN** 响应 `origin` 为 `"chat"`
- **AND** 响应 `task` 为 `null`

#### Scenario: proposal commitHash 缺失时输出 null

- **WHEN** 命中的 proposal link 没有持久化 `commitHash` 字段
- **THEN** 响应中该 proposal 的 `commitHash` 为 `null`

### Requirement: lineage 工具派生 proposal 状态

`lineage` 工具 SHALL 为每个返回 proposal 派生 `status` 字段，取值 SHALL 为 `"completed"`、`"applying"` 或 `"pending"`。

状态派生规则如下：

1. 当 proposal link 含非空 `commitHash` 时，`status` SHALL 为 `"completed"`。
2. 当 proposal link 无 `commitHash`，且 `FYLLO_PROJECT_PATH/openspec/changes/<changeId>/.openspec.yaml` 存在并声明 `status: applying` 时，`status` SHALL 为 `"applying"`。
3. 其他情况 `status` SHALL 为 `"pending"`。

工具 SHALL NOT 读取 Git 历史来判断 completed 状态，SHALL NOT 读取 archive 目录推导 commit hash，SHALL NOT 支持短 SHA 匹配。

#### Scenario: 有 commitHash 时为 completed

- **WHEN** proposal link 包含 `commitHash: "abcdef123456"`
- **THEN** 响应中该 proposal 的 `status` 为 `"completed"`

#### Scenario: active applying change 为 applying

- **WHEN** proposal link 不包含 `commitHash`
- **AND** `FYLLO_PROJECT_PATH/openspec/changes/add-foo/.openspec.yaml` 包含 `status: applying`
- **THEN** 响应中 changeId 为 `add-foo` 的 proposal `status` 为 `"applying"`

#### Scenario: 未完成且非 applying 时为 pending

- **WHEN** proposal link 不包含 `commitHash`
- **AND** `FYLLO_PROJECT_PATH/openspec/changes/add-foo/.openspec.yaml` 不存在或未声明 `status: applying`
- **THEN** 响应中 changeId 为 `add-foo` 的 proposal `status` 为 `"pending"`
