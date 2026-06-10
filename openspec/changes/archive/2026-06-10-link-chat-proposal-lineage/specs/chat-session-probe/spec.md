## ADDED Requirements

### Requirement: probe 阶段生成并持有 fylloSessionId 并在转正时沿用

`ProbeEntry`（`src/main/services/chat/session-probe-registry.ts`）SHALL 新增字段 `fylloSessionId: string`，在 `ensureProbe` 写入 `starting` 占位 entry 时即通过 `newSessionId()`（`src/main/infra/ids`）生成并赋值。`ProbeSnapshot`（`session-probe-service.ts`）SHALL 同步新增 `fylloSessionId: string` 字段，由 `toProbeSnapshot` 一并映射。

该 fylloSessionId SHALL 作为 `getBundledMcpServers` 的 `fylloSessionId` 入参注入 MCP env（见 `bundled-mcp-servers` spec 与本 spec「ensureProbe ... 注入 fylloSessionId」Requirement）。

renderer 侧 draft probe 携带（`carryProbe`，`src/renderer/src/stores/chat.ts`）SHALL 在原有 `acpSessionId`、`configOptions`、`availableCommands` 之外新增携带 probe 的 `fylloSessionId`；`sendMessage` draft 分支在调用 `sessionStore.createSession` 时 SHALL 把该 `fylloSessionId` 作为入参透传，使转正后的正式会话沿用 probe 阶段已注入 MCP env 的同一 fylloSessionId。

当某 agent 的 probe 被 `closeProbe` 或 agent-unavailable 清理（`SessionProbeRegistry.delete`）移除时，其 `fylloSessionId` SHALL 随 entry 一并丢弃，不落盘、不残留。

#### Scenario: probe 占位时即生成 fylloSessionId

- **WHEN** `ensureProbe("claude-code", projectPath)` 写入 `starting` 占位 entry
- **THEN** 该 entry 的 `fylloSessionId` 为经 `newSessionId()` 生成的非空字符串
- **AND** `toProbeSnapshot` 返回的 snapshot 携带该 `fylloSessionId`

#### Scenario: 转正时沿用 probe 的 fylloSessionId

- **WHEN** 草稿态下用户向已 ready 的 probe 会话发送首条消息
- **AND** `carryProbe` 取出 probe entry 的 `fylloSessionId` 为 `"sess-P"`
- **THEN** `sendMessage` 调用 `sessionStore.createSession` 时入参携带 `fylloSessionId: "sess-P"`
- **AND** 转正后的正式会话 sessionId 为 `"sess-P"`（与 probe 注入 MCP env 的 fylloSessionId 一致）

#### Scenario: 切 agent 丢弃 draft fylloSessionId

- **WHEN** probe entry 因 `closeProbe` 或 agent 进程不可用被 `SessionProbeRegistry.delete` 移除
- **THEN** 该 entry 的 `fylloSessionId` 随之丢弃
- **AND** 不写入任何持久化存储

### Requirement: ensureProbe 调用 newSession 时注入 entry 的 fylloSessionId

`ensureProbe`（`src/main/services/chat/session-probe-service.ts`）在计算 `mcpServers` 时 SHALL 调用 `getBundledMcpServers({ projectPath, fylloSessionId })`，其中 `fylloSessionId` 取自当前 `starting` 占位 entry 已生成的 `fylloSessionId`，从而使 probe 阶段 `connection.newSession` 启动的 MCP server 进程 env 即携带正确的 `FYLLO_SESSION_ID`。

此为对既有 `ensureProbe` 流程「步骤 5：通过 `getBundledMcpServers({ projectPath })` 计算 `mcpServers`」的精确化：入参从 `{ projectPath }` 变为 `{ projectPath, fylloSessionId }`，其余步骤行为不变。

#### Scenario: probe newSession 注入 FYLLO_SESSION_ID

- **WHEN** `ensureProbe` 进入新建流程，占位 entry 的 `fylloSessionId` 为 `"sess-P"`
- **THEN** 计算 `mcpServers` 时调用 `getBundledMcpServers({ projectPath, fylloSessionId: "sess-P" })`
- **AND** `connection.newSession({ cwd: projectPath, mcpServers })` 启动的 MCP server env 含 `FYLLO_SESSION_ID === "sess-P"`

## MODIFIED Requirements

### Requirement: SessionProbeRegistry 在主进程维护按 agentId 索引的内存态

系统 SHALL 在 `src/main/services/chat/session-probe-registry.ts` 中导出单例 `SessionProbeRegistry`，维护一个进程级别的纯内存 `Map<string, ProbeEntry>`，键为 `agentId`，值为 `ProbeEntry`。

`ProbeEntry` 类型 SHALL 定义为：

```ts
type ProbeStatus = "starting" | "ready" | "failed";

interface ProbeEntry {
  agentId: string;
  status: ProbeStatus;
  fylloSessionId: string;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  error?: { code: string; message: string };
  startedAt: number;
  inflightEnsure?: Promise<ProbeEntry>;
}
```

`fylloSessionId` 字段 SHALL 在 entry 创建（`starting` 占位）时即由 `newSessionId()` 生成并赋值，且在该 entry 生命周期内不变。`availableCommands` 字段 SHALL 与 `configOptions` 并列，类型为 `@shared/types/chat` 导出的 `AcpAvailableCommand[]`。占位（`status === "starting"`）与失败（`status === "failed"`）entry 的 `availableCommands` SHALL 初始化为空数组 `[]`。

`SessionProbeRegistry` SHALL 暴露以下方法：

- `get(agentId: string): ProbeEntry | undefined`
- `set(agentId: string, entry: ProbeEntry): void`
- `delete(agentId: string): ProbeEntry | undefined`
- `takeFor(agentId: string, expectedAcpSessionId: string): ProbeEntry | null`：仅当 `entry.acpSessionId === expectedAcpSessionId` 时移除并返回该 entry，否则返回 `null`，确保 promote 与 close 之间的原子性
- `keys(): string[]`：用于诊断和清理

`SessionProbeRegistry` SHALL NOT 落盘任何状态。进程退出时 entries 直接随进程释放，SHALL NOT 调用 `closeSession`（agent 进程会随主进程一并退出）。

`toProbeSnapshot(entry: ProbeEntry): ProbeSnapshot` SHALL 将 `entry.availableCommands` 与 `entry.fylloSessionId` 一并映射到 snapshot 对应字段。

#### Scenario: 首次 ensure 写入 starting entry

- **WHEN** `SessionProbeRegistry.set("claude-code", { status: "starting", ... })` 被调用，且原本 Map 中无该 agentId
- **THEN** Map 中新增该条目
- **AND** 后续 `get("claude-code")` 返回该 entry
- **AND** 该 entry 的 `availableCommands` 为空数组 `[]`
- **AND** 该 entry 的 `fylloSessionId` 为非空字符串

#### Scenario: takeFor 在 acpSessionId 不匹配时返回 null

- **WHEN** Registry 中 `claude-code` 对应 entry 的 `acpSessionId` 为 `"sess-A"`
- **AND** 调用 `takeFor("claude-code", "sess-B")`
- **THEN** 返回 `null`
- **AND** Map 中该 entry 仍然存在

#### Scenario: takeFor 匹配成功后 entry 从 Map 移除

- **WHEN** Registry 中 `claude-code` 对应 entry 的 `acpSessionId` 为 `"sess-A"`
- **AND** 调用 `takeFor("claude-code", "sess-A")`
- **THEN** 返回该 entry（含其 `availableCommands` 与 `fylloSessionId`）
- **AND** Map 中不再包含该 agentId 的条目

#### Scenario: toProbeSnapshot 映射 availableCommands 与 fylloSessionId

- **WHEN** `toProbeSnapshot` 接收一个 `availableCommands` 为 `[{ name: "init", description: "..." }]`、`fylloSessionId` 为 `"sess-P"` 的 entry
- **THEN** 返回的 snapshot 的 `availableCommands` 与该数组内容一致
- **AND** 返回的 snapshot 的 `fylloSessionId` 为 `"sess-P"`
