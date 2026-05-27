## ADDED Requirements

### Requirement: SessionMeta 持久化 ACP session 级 config_options

`SessionMeta`（`electron/main/infra/storage/session-store.ts` 导出）SHALL 新增可选字段 `config_options?: AcpSessionConfigOption[]`，与 `available_commands?: AcpAvailableCommand[]` 同位治理。落盘 key 名 SHALL 为 snake_case `config_options`，与 `available_commands` 风格一致；内存层（`Session.configOptions`）SHALL 为驼峰 `configOptions`。

`session-store.ts` 的字段级更新接口 SHALL 支持把 `config_options` 当作普通字段进行 patch 写入，遵循"Session meta field updates preserve unrelated fields"约束：单次写入只改本次明确指定的字段，未变更字段（含 `available_commands`、`tokenUsage`、`acpSessionId`、`agentId`、`title` 等）原样保留。

`chat-service#toSession` SHALL 把 `meta.config_options` 映射到 `Session.configOptions`，使 `chat:listSessions` 与 `chat:createSession` 等返回值一致地暴露 configOptions 内存态字段。

`config_options` 是 per-session 字段，SHALL NOT 跨 session 复用。任何"按 agentId 缓存 schema"的需求都不在本规范范围内，session-store 也 SHALL NOT 提供按 agentId 聚合 configOptions 的接口。

#### Scenario: 首次 newSession 后写入 config_options

- **WHEN** ACP `newSession` 响应携带非空 `configOptions`
- **AND** chat handler 在 `enqueueSessionMetaPersist` 中 patch `{ config_options, updatedAt }`
- **THEN** session meta JSON 文件包含 `config_options` 字段
- **AND** 现存的 `available_commands`、`tokenUsage`、`acpSessionId` 不变

#### Scenario: setConfigOption 响应回写 config_options

- **WHEN** `chat:setConfigOption` service 调用成功，agent 返回新的 `configOptions`
- **THEN** service 通过 session-store 字段级更新接口写入 `config_options`
- **AND** 已有 `available_commands` 与其他字段保持原值

#### Scenario: 二次 turn 启动不覆盖 config_options

- **WHEN** 某 session 已持久化 `config_options`
- **AND** 后续一次 `AcpSession.start()` 因更新 `acpSessionId`、`turnCount`、`updatedAt` 触发 session meta 写入
- **THEN** 写回后的 session meta 仍保留原有 `config_options`，除非本 turn 的 `config_options_update` 事件已携带新全集

#### Scenario: 空数组也正确持久化

- **WHEN** agent 推送 `config_option_update` 携带空 `configOptions`
- **THEN** session-store 将 `config_options` 持久化为 `[]`
- **AND** 后续其他 session meta 更新仍保留该空数组

#### Scenario: listSessions 返回包含 configOptions

- **WHEN** renderer 调用 `chat:listSessions`
- **THEN** main 调用 `listSessionMetas`，并在 `toSession(meta, projectId)` 内把 `meta.config_options` 映射为 `Session.configOptions`（未持久化时为 `undefined`）
