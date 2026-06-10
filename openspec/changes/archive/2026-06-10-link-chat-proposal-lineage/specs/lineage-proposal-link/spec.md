## ADDED Requirements

### Requirement: MCP 事件目录路径约定

系统 SHALL 在 `src/main/infra/storage/project-paths.ts` 新增 `mcpEventsDir(projectPath: string): string`，返回 `projects/<encodedProjectId>/mcp-events`，其中 `<encodedProjectId>` 经现有 `encodeProjectPath` 编码、目录基于现有 `projectDir(projectPath)`。该目录 SHALL 始终位于主项目 userData 下，SHALL NOT 随 linked worktree 变化。调用方 SHALL NOT 在 service / handler / MCP 层手写该路径拼接。

#### Scenario: 事件目录落点

- **WHEN** 对某 `projectPath` 调用 `mcpEventsDir(projectPath)`
- **THEN** 返回路径等于 `join(projectDir(projectPath), "mcp-events")`
- **AND** 与 `lineageDir(projectPath)`、`sessionsDir(projectPath)` 同级，复用同一 `encodeProjectPath` 编码

#### Scenario: linked worktree 模式下目录仍指向主项目

- **WHEN** create-proposal 以 `workspaceMode: "linked"` 在 `.worktrees/<changeName>` 内创建 proposal
- **AND** 主进程注入的 `FYLLO_MCP_EVENT_DIR` 基于主项目 `projectPath` 计算
- **THEN** 事件文件写入主项目 userData 下的 `mcp-events` 目录，而非 worktree 内部

### Requirement: MCP 事件文件格式与原子写

`create-proposal` 工具写出的事件文件 SHALL 命名为 `<timestamp>-<nanoid>.json`，使并发写入同一目录的多个事件互不覆盖（一文件一事件）。文件内容 SHALL 为如下结构的 JSON 对象：

```json
{
  "server": "fyllo-specs",
  "tool": "create-proposal",
  "createdAt": "<ISO 8601 字符串>",
  "sessionId": "<fylloSessionId>",
  "changeId": "<changeName>"
}
```

写入 SHALL 采用「先写临时文件再 rename」的原子写，确保消费侧不会读到半写内容。事件文件类型 SHALL 在共享类型层（建议 `src/shared/types/`）定义并被写出方与消费方共用。

#### Scenario: 事件文件内容完整

- **WHEN** `create-proposal` 成功创建 changeName 为 `add-foo` 的 change，且 `FYLLO_SESSION_ID` 为 `sess-1`
- **THEN** 事件目录新增一个 `<timestamp>-<nanoid>.json` 文件
- **AND** 其内容 `sessionId === "sess-1"`、`changeId === "add-foo"`、`server === "fyllo-specs"`、`tool === "create-proposal"`、`createdAt` 为合法 ISO 8601 字符串

#### Scenario: 并发写入不互相覆盖

- **WHEN** 两个会话在相近时刻各自创建 proposal，写入同一事件目录
- **THEN** 生成两个文件名不同的事件文件
- **AND** 两条事件均完整保留，无一被覆盖

### Requirement: 主进程以 project 维度幂等懒创建事件消费者

系统 SHALL 在 `src/main/services/lineage/`（建议 `mcp-event-consumer.ts`）提供 `ensureLineageEventConsumer(projectPath: string): void`（或等价返回值），以进程级 `Map<projectPath, watcher>` 去重：当该 projectPath 已有活跃消费者时为零成本 no-op，否则创建之。此函数 SHALL 可被任意时机安全重复调用（仿 `getOrStartProcess` 范式）。

`src/main/ipc/chat.ts` 的 `chat:listSessions` handler SHALL 在解析出 `projectPath` 后调用 `ensureLineageEventConsumer(projectPath)`，作为「进入项目聊天区」的触发点。

#### Scenario: 重复调用幂等

- **WHEN** 对同一 `projectPath` 多次调用 `ensureLineageEventConsumer`
- **THEN** 仅首次创建 watcher 与执行启动扫描
- **AND** 后续调用为 no-op，不重复创建 watcher、不重复 `fs.watch`

#### Scenario: listSessions 触发消费者创建

- **WHEN** renderer 调 `chat:listSessions { projectId }`
- **THEN** 主进程解析 `projectPath` 后调用 `ensureLineageEventConsumer(projectPath)`
- **AND** 该 project 的事件消费者被确保存在

### Requirement: 事件消费经 recordProposal 挂边并对纯 chat 起源兜底建链

事件消费者每次处理 SHALL 以 `readdir(mcpEventsDir(projectPath))` 全量扫描为准（而非仅处理 `fs.watch` 报告的单个文件名），对每个可解析的事件文件：

1. 解析得到 `sessionId` 与 `changeId`。
2. 调用 `recordProposal(projectPath, sessionId, changeId)`。
3. 若 `recordProposal` 返回 `null`（经 `index.sessions` 反查不到 subject，即纯 chat 起源、从未 `linkSession`），则先调用 `ensureChatSubject(projectPath, sessionId)` 建链，再重试一次 `recordProposal(projectPath, sessionId, changeId)`。
4. 处理成功后删除该事件文件。

消费 SHALL NOT 修改 `recordProposal` / `ensureChatSubject` 的既有契约——兜底逻辑位于消费编排层。主进程 SHALL 保持为 lineage 的唯一写入者；MCP 侧仅产出事件文件。

遇到无法解析（损坏）的事件文件，消费者 SHALL 跳过该文件并记日志，不中断其余文件处理（与 lineage-store「损坏文件跳过」一致）。

#### Scenario: task 起源会话直接挂边

- **WHEN** 事件文件的 `sessionId` 已在 `index.sessions`（从任务页发起讨论已 `linkSession`）
- **THEN** `recordProposal` 直接在既有 subject 的对应 session link 追加 `changeId`
- **AND** 不调用 `ensureChatSubject`
- **AND** 事件文件被删除

#### Scenario: 纯 chat 起源会话兜底建链后挂边

- **WHEN** 事件文件的 `sessionId` 不在 `index.sessions`（直接开聊、从未从任务页发起）
- **THEN** 首次 `recordProposal` 返回 `null`
- **AND** 消费者调用 `ensureChatSubject(projectPath, sessionId)` 建立 `origin="chat"`、`task=null` 的 subject
- **AND** 重试 `recordProposal` 成功追加 `changeId`
- **AND** 事件文件被删除

#### Scenario: 损坏事件文件被跳过

- **WHEN** 事件目录中存在一个无法解析为合法事件 JSON 的文件
- **AND** 消费者执行一次全量扫描
- **THEN** 跳过该损坏文件并记日志
- **AND** 其余合法事件文件正常被消费

### Requirement: 启动残留扫描实现崩溃恢复

事件消费者在某 project 首次创建时 SHALL 先对 `mcpEventsDir(projectPath)` 执行一次 `readdir` 全量消费（重放上次未消费完的残留事件），然后才进入 `fs.watch`。`fs.watch` 触发的事件 SHALL 仅作为「尽快重新扫描」的信号，实际消费仍以全量 `readdir` 为准，从而即使 `fs.watch` 丢失或重复事件，残留也能由下次任意触发或下次启动扫描兜底。

#### Scenario: 重启后消费残留事件

- **WHEN** 上次运行中已写入事件文件但主进程在消费前退出
- **AND** 重启后该 project 的事件消费者首次被 `ensureLineageEventConsumer` 创建
- **THEN** 启动扫描读取并消费这些残留事件文件，挂边后删除
- **AND** 随后进入 `fs.watch` 监听新事件

#### Scenario: fs.watch 丢事件时仍最终一致

- **WHEN** 某事件文件写入后 `fs.watch` 未触发对应通知
- **THEN** 该文件在下一次任意 `fs.watch` 触发的全量扫描、或下次启动扫描时被消费
- **AND** 不会因单次 watch 丢事件而永久遗漏

### Requirement: 事件消费者注册为主进程 disposable

事件消费服务 SHALL 通过 `registerDisposable({ name, dispose })`（`src/main/bootstrap/lifecycle.ts`）注册自身，`dispose` SHALL 关闭 `Map` 内所有 project 的 `fs.watch` watcher。watcher SHALL NOT 在「离开项目」时单独关闭，而是随 `disposeAll`（`before-quit`）统一回收。

#### Scenario: 退出时统一关闭所有 watcher

- **WHEN** 应用 `before-quit` 触发 `disposeAll`
- **THEN** 事件消费服务的 `dispose` 被调用
- **AND** `Map` 内所有 project 的 watcher 被关闭，无句柄泄漏
