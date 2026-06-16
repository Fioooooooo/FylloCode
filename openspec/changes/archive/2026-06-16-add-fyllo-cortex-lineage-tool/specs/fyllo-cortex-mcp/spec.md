## ADDED Requirements

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
