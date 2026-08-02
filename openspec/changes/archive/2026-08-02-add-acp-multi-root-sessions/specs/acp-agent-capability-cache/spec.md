## ADDED Requirements

### Requirement: Additional directories capability 保持三态语义

系统 SHALL 让 renderer 与 Main 的 capability selector 将 Agent 的 `sessionCapabilities.additionalDirectories` 归一化为 `supported | unsupported | unknown`，同时保留 ACP SDK 原始 marker。完整 initialize snapshot 中非 null marker SHALL 表示 `supported`，完整 snapshot 中缺失或 null marker SHALL 表示 `unsupported`；cache entry 缺失或 v1 prompt-only partial snapshot SHALL 表示 `unknown`，不得直接归一化为 false。

#### Scenario: 完整 snapshot 声明 marker

- **WHEN** Agent 的完整 initialize snapshot 含非 null `sessionCapabilities.additionalDirectories`
- **THEN** selector SHALL 返回 `supported`
- **AND** cache 与 IPC SHALL 保留原始 marker 及扩展字段

#### Scenario: 完整 snapshot 未声明 marker

- **WHEN** Agent 已有完整 initialize snapshot但 additional directories marker 缺失或为 null
- **THEN** selector SHALL 返回 `unsupported`
- **AND** selector SHALL NOT 因其他 session capability 存在而推断支持

#### Scenario: Legacy partial snapshot

- **WHEN** Agent 只有从 version 1 prompt-only cache 提升的 partial snapshot，或完全没有 capability entry
- **THEN** selector SHALL 返回 `unknown`
- **AND** renderer SHALL NOT 把该状态永久呈现为已确认不支持

### Requirement: Agent 可用性只在实际需要附加目录时受限

系统 SHALL 以目标 Session snapshot 的 `additionalDirectories` 是否为空判断是否需要 additional directories capability。空数组时 `supported`、`unsupported` 与 `unknown` Agent 均 SHALL 保持可用；非空时只有 `supported` Agent SHALL 可启动 probe、创建或恢复 Agent Session。`unknown` Agent SHALL 先通过既有 `ensureAgent` 完成 initialize 并重新判定，Main SHALL 在每个 activation 入口执行最终校验。

#### Scenario: 单根 Workspace 使用不支持该能力的 Agent

- **WHEN** Session snapshot 的 `additionalDirectories` 为空且 Agent 状态为 `unsupported` 或 `unknown`
- **THEN** picker SHALL 允许选择该 Agent
- **AND** Main SHALL 允许其按单根 `cwd` 启动

#### Scenario: 多根 Workspace 使用支持该能力的 Agent

- **WHEN** Session snapshot 的 `additionalDirectories` 非空且 Agent 状态为 `supported`
- **THEN** picker SHALL 允许选择该 Agent
- **AND** probe 与 Chat activation SHALL 可继续执行

#### Scenario: 多根 Workspace 遇到未知能力

- **WHEN** Session snapshot 的 `additionalDirectories` 非空且 Agent 状态为 `unknown`
- **THEN** picker SHALL 显示“连接后检测”语义并调用既有 `ensureAgent`
- **AND** 刷新结果为 `supported` 前 SHALL NOT 启动 probe

#### Scenario: Renderer 绕过 picker

- **WHEN** renderer 对需要附加目录的 Workspace 直接请求一个 `unsupported` 或仍为 `unknown` 的 Agent activation
- **THEN** Main SHALL 以 capability mismatch 拒绝请求
- **AND** SHALL NOT 降级为只传 primary Folder
