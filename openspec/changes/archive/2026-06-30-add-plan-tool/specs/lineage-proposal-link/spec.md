## MODIFIED Requirements

### Requirement: MCP 事件文件格式与原子写

`fyllo-specs` 工具写出的 lineage 事件文件 SHALL 命名为 `<timestamp>-<nanoid>.json`，使并发写入同一目录的多个事件互不覆盖（一文件一事件）。写入 SHALL 采用“先写临时文件再 rename”的原子写，确保消费侧不会读到半写内容。事件文件类型 SHALL 在共享类型层定义并被写出方与消费方共用。

系统 SHALL 支持两类事件：

`create-proposal` 事件：

```json
{
  "server": "fyllo-specs",
  "tool": "create-proposal",
  "createdAt": "<ISO 8601 字符串>",
  "sessionId": "<fylloSessionId>",
  "changeId": "<changeName>"
}
```

`create-plan` 事件：

```json
{
  "server": "fyllo-specs",
  "tool": "create-plan",
  "createdAt": "<ISO 8601 字符串>",
  "sessionId": "<fylloSessionId>",
  "planSlug": "<yyyy-MM-dd-agent-slug>"
}
```

#### Scenario: proposal 事件文件内容完整

- **WHEN** `create-proposal` 成功创建 changeName 为 `add-foo` 的 change，且 `FYLLO_SESSION_ID` 为 `sess-1`
- **THEN** 事件目录新增一个 `<timestamp>-<nanoid>.json` 文件
- **AND** 其内容 `sessionId === "sess-1"`、`changeId === "add-foo"`、`server === "fyllo-specs"`、`tool === "create-proposal"`、`createdAt` 为合法 ISO 8601 字符串

#### Scenario: plan 事件文件内容完整

- **WHEN** `create-plan` 成功创建 plan slug 为 `2026-06-29-plan-a` 的 plan，且 `FYLLO_SESSION_ID` 为 `sess-1`
- **THEN** 事件目录新增一个 `<timestamp>-<nanoid>.json` 文件
- **AND** 其内容 `sessionId === "sess-1"`、`planSlug === "2026-06-29-plan-a"`、`server === "fyllo-specs"`、`tool === "create-plan"`、`createdAt` 为合法 ISO 8601 字符串

#### Scenario: 并发写入不互相覆盖

- **WHEN** 两个会话在相近时刻各自创建 proposal 或 plan，写入同一事件目录
- **THEN** 生成多个文件名不同的事件文件
- **AND** 每条事件均完整保留，无一被覆盖

### Requirement: 事件消费经 recordProposal 挂边并对纯 chat 起源兜底建链

事件消费者每次处理 SHALL 以 `readdir(mcpEventsDir(projectPath))` 全量扫描为准（而非仅处理 `fs.watch` 报告的单个文件名），对每个可解析的事件文件按 `tool` 分发：

1. `tool === "create-proposal"`：调用 `recordProposal(projectPath, sessionId, changeId)`。
2. `tool === "create-plan"`：调用 `recordPlan(projectPath, sessionId, planSlug)`。

若对应 record 调用返回 `null`（经 `index.sessions` 反查不到 subject，即纯 chat 起源、从未 `linkSession`），消费者 SHALL 先调用 `ensureChatSubject(projectPath, sessionId)` 建链，再重试一次对应 record 调用。

处理成功后删除该事件文件。消费 SHALL NOT 修改 `recordProposal` / `recordPlan` / `ensureChatSubject` 的既有契约；兜底逻辑位于消费编排层。主进程 SHALL 保持为 lineage 的唯一写入者；MCP 侧仅产出事件文件。

遇到无法解析（损坏）的事件文件，消费者 SHALL 跳过该文件并记日志，不中断其余文件处理（与 lineage-store“损坏文件跳过”一致）。

#### Scenario: proposal 事件直接挂边

- **WHEN** 事件文件为 `create-proposal`
- **AND** 事件文件的 `sessionId` 已在 `index.sessions`
- **THEN** `recordProposal` 直接在既有 subject 的对应 session link 追加 `changeId`
- **AND** 不调用 `ensureChatSubject`
- **AND** 事件文件被删除

#### Scenario: plan 事件直接挂边

- **WHEN** 事件文件为 `create-plan`
- **AND** 事件文件的 `sessionId` 已在 `index.sessions`
- **THEN** `recordPlan` 直接在既有 subject 的对应 session link 追加 `planSlug`
- **AND** 不调用 `ensureChatSubject`
- **AND** 事件文件被删除

#### Scenario: 纯 chat 起源 plan 事件兜底建链后挂边

- **WHEN** 事件文件为 `create-plan`
- **AND** 事件文件的 `sessionId` 不在 `index.sessions`
- **THEN** 首次 `recordPlan` 返回 `null`
- **AND** 消费者调用 `ensureChatSubject(projectPath, sessionId)` 建立 `origin="chat"`、`task=null` 的 subject
- **AND** 重试 `recordPlan` 成功追加 `planSlug`
- **AND** 事件文件被删除

#### Scenario: 损坏事件文件被跳过

- **WHEN** 事件目录中存在一个无法解析为合法事件 JSON 的文件
- **AND** 消费者执行一次全量扫描
- **THEN** 跳过该损坏文件并记日志
- **AND** 其余合法事件文件正常被消费
