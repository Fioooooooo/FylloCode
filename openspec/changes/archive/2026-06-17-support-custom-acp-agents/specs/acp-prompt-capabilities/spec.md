# acp-prompt-capabilities 规范（变更）

## Purpose

定义 ACP `promptCapabilities` 的归一化、缓存、失效与 IPC 查询契约，用于在渲染端判断 agent 是否支持图片和 embedded context 等多模态 prompt 能力。本次变更支持没有 `installedVersion` 的自定义 Agent。

## MODIFIED Requirements

### Requirement: AcpPromptCapabilities 类型与 IPC 契约

系统 SHALL 在 `src/shared/types/acp-agent.ts` 暴露 `AcpPromptCapabilities` 类型，对应 ACP `InitializeResponse.agentCapabilities.promptCapabilities` 的稳定字段子集：

```ts
interface AcpPromptCapabilities {
  image: boolean;
  audio: boolean;
  embeddedContext: boolean;
}
```

ACP 协议中三个字段都是 optional boolean，FylloCode 在归一化时 SHALL 将 `undefined` 转为 `false`，磁盘缓存与 IPC 出入参均使用归一化后的形态。

#### Scenario: 归一化 ACP 协议 optional 字段

- **WHEN** ACP `initializeResponse.agentCapabilities.promptCapabilities` 为 `{ image: true }`（其他字段缺失）
- **THEN** FylloCode 内部表示为 `{ image: true, audio: false, embeddedContext: false }`

#### Scenario: ACP 协议未声明 promptCapabilities

- **WHEN** ACP `initializeResponse.agentCapabilities.promptCapabilities` 为 `undefined`
- **THEN** FylloCode 内部表示为 `{ image: false, audio: false, embeddedContext: false }`

### Requirement: agent-capabilities.json 磁盘缓存

系统 SHALL 在 `data/acp/agent-capabilities.json` 持久化每个 agent 的 `promptCapabilities`，schema 形如：

```json
{
  "version": 1,
  "agents": {
    "<agentId>": {
      "promptCapabilities": { "image": false, "audio": false, "embeddedContext": false },
      "capturedAgentVersion": "<installedVersion>",
      "capturedAt": "<ISO timestamp>"
    }
  }
}
```

- 文件路径基于 `getDataSubPath('acp')`
- `agents` key 使用 `AcpAgentEntry.id`（与 `installed.json` / registry 一致）**或 Custom Agent id**
- `capturedAgentVersion` 来自该 agent 当前 `installed.installedVersion`；**Custom Agent 的 `capturedAgentVersion` SHALL 固定为空字符串 `""**
- `capturedAt` 为 ISO 时间戳

读写 SHALL 经由 `src/main/infra/storage/agent-capability-store.ts` 提供的统一 API，主进程其他模块 MUST NOT 自行 `load → merge → save` 整对象回写。

#### Scenario: initialize 成功后写入缓存

- **WHEN** ACP 进程通过 `connection.initialize(...)` 返回 `agentCapabilities`
- **THEN** 进程池调 `agent-capability-store.upsertPromptCapabilities(agentId, capabilities, installedVersion)`
- **AND** 文件中 `agents[agentId]` 被覆盖为最新值（其他 agent 条目保留）

#### Scenario: 自定义 Agent 写入缓存

- **WHEN** 一个 custom agent 通过 `connection.initialize(...)` 返回 `agentCapabilities`
- **THEN** 进程池调 `agent-capability-store.upsertPromptCapabilities(customAgentId, capabilities, "")`
- **AND** 文件中 `agents[customAgentId]` 的 `capturedAgentVersion` 为 `""`

#### Scenario: 读取磁盘缓存

- **WHEN** 渲染进程通过 `acp:loadCapabilitiesCache` IPC 请求所有缓存
- **THEN** 主进程读 `agent-capabilities.json`，返回 `Record<agentId, AcpPromptCapabilities>`
- **AND** 文件不存在时返回空对象，不抛错

#### Scenario: 文件损坏时降级

- **WHEN** `agent-capabilities.json` 内容无法解析为合法 JSON 或不符合 v1 schema
- **THEN** `agent-capability-store` 返回空 cache 并 logger.warn
- **AND** 不抛错、不阻塞主进程启动

### Requirement: capturedAgentVersion 作为失效信号

系统 SHALL 在调用 `acp:ensureAgent` 启动 agent 进程时，对比磁盘缓存中的 `capturedAgentVersion` 与当前 `installed.installedVersion`：

- 一致：直接使用磁盘缓存值，跳过运行时检测的 UI 阻塞
- 不一致：磁盘缓存视为失效，等待 `connection.initialize(...)` 完成后用最新值覆盖

**对于 Custom Agent，`installed.installedVersion` 视为空字符串 `""`。因此当缓存中 `capturedAgentVersion` 为空字符串时视为一致，可直接使用缓存；否则视为不一致。**

#### Scenario: 缓存版本与 installedVersion 一致

- **WHEN** `acp:ensureAgent` 被调用
- **AND** 磁盘缓存中 `agents[agentId].capturedAgentVersion === installed.installedVersion`
- **THEN** IPC 立即返回缓存中的 `promptCapabilities`（不阻塞等待 initialize）
- **AND** 异步触发 / 复用进程池启动，启动完成后再次落盘以更新 `capturedAt`

#### Scenario: 缓存版本与 installedVersion 不一致

- **WHEN** `acp:ensureAgent` 被调用
- **AND** 磁盘缓存中 `agents[agentId].capturedAgentVersion !== installed.installedVersion`（含缺失情况）
- **THEN** IPC SHALL 等待进程 `initialize` 完成后再返回最新 `promptCapabilities`
- **AND** 完成后落盘的 `capturedAgentVersion` 等于当前 `installed.installedVersion`

#### Scenario: 自定义 Agent 缓存命中

- **WHEN** 调用 `acp:ensureAgent` 传入 custom agent id
- **AND** 磁盘缓存中存在该 id 且 `capturedAgentVersion === ""`
- **THEN** IPC 立即返回缓存中的 `promptCapabilities`

#### Scenario: 自定义 Agent 缓存未命中

- **WHEN** 调用 `acp:ensureAgent` 传入 custom agent id
- **AND** 磁盘缓存中不存在该 id
- **THEN** IPC SHALL 等待进程 `initialize` 完成后返回最新 `promptCapabilities`
- **AND** 落盘时 `capturedAgentVersion` 为 `""`

### Requirement: acp:ensureAgent IPC

系统 SHALL 实现 `acp:ensureAgent` IPC handler，接受 `{ agentId: string }`，返回 `IpcResponse<{ promptCapabilities: AcpPromptCapabilities }>`。

handler SHALL 复用现有进程池的懒启动语义（不重复启动已存在进程），通过 `AgentProcess.initializeResponse` 取出 `promptCapabilities` 并归一化返回。**对于 Custom Agent，handler SHALL 跳过 `installed.json` 检查，直接通过 Agent Catalog 获取启动配置。**

#### Scenario: 首次调用懒启动 agent 进程

- **WHEN** 渲染进程调用 `acp:ensureAgent({ agentId })`
- **AND** 该 agent 在进程池中没有活跃实例
- **THEN** 主进程通过进程池启动并完成 `initialize` 握手
- **AND** 把归一化后的 `promptCapabilities` 写入 `agent-capabilities.json`
- **AND** 返回 `IpcResponse.ok({ promptCapabilities })`

#### Scenario: 自定义 Agent 首次调用

- **WHEN** 渲染进程调用 `acp:ensureAgent({ agentId: "custom-xxx" })`
- **THEN** 主进程 SHALL 不检查 `installed.json`
- **AND** 通过 Agent Catalog 加载 `command/args/env` 并启动进程
- **AND** 返回 `IpcResponse.ok({ promptCapabilities })`

#### Scenario: agent 已在线时直接复用

- **WHEN** 渲染进程调用 `acp:ensureAgent({ agentId })`
- **AND** 进程池中已有该 agent 活跃实例
- **THEN** handler 直接读取实例缓存的 `initializeResponse.agentCapabilities.promptCapabilities`
- **AND** 不重新执行 `initialize`

#### Scenario: 启动失败返回错误

- **WHEN** agent 进程启动失败（二进制不存在 / 协议握手失败 / 超时）
- **THEN** handler 返回 `IpcResponse.error({ code, message })`，复用现有 acp 启动错误码
- **AND** 不写入 `agent-capabilities.json`

### Requirement: acp:loadCapabilitiesCache IPC

系统 SHALL 实现 `acp:loadCapabilitiesCache` IPC handler，无入参，返回 `IpcResponse<Record<agentId, AcpPromptCapabilities>>`，供渲染端启动期同步读取磁盘缓存。

#### Scenario: 渲染端启动期加载

- **WHEN** 渲染进程在 `useAcpAgentsStore` 初始化阶段调用 `acp:loadCapabilitiesCache`
- **THEN** 主进程返回所有已缓存 agent 的 `promptCapabilities` 映射
- **AND** 渲染端写入 `promptCapabilitiesByAgent: Map<agentId, AcpPromptCapabilities>`

### Requirement: agentUnavailable 时清理 capability 缓存的内存态

系统 SHALL 在 ACP 进程触发 `agentUnavailable` 事件时，清除 `useAcpAgentsStore.promptCapabilitiesByAgent` 中对应 agentId 的内存条目，磁盘缓存保持不动。

#### Scenario: 进程崩溃后内存态失效

- **WHEN** 主进程通过现有 `agentUnavailable` broadcast 通知渲染端 agentX 崩溃
- **THEN** `useAcpAgentsStore` 从 `promptCapabilitiesByAgent` 删除 `agentX` 条目
- **AND** 后续 UI 立即视该 agent 为 capability 未知（三个能力均按 false 处理）
- **AND** 用户下次切到该 agent 时由 `ChatPromptPanel` watch 触发 `acp:ensureAgent` 重建

#### Scenario: 磁盘缓存不受 agentUnavailable 影响

- **WHEN** `agentUnavailable` 事件触发
- **THEN** `agent-capabilities.json` 文件保持不变（保留上次成功 initialize 的值用于下次启动期加载）

### Requirement: 自定义 Agent 配置变更时失效 capabilities 缓存

**当用户通过设置页保存 `custom-agents.json` 后，系统 SHALL 从内存与磁盘中删除所有 custom agent 的 capabilities 缓存条目，确保下次使用时重新获取。**

#### Scenario: 保存 custom-agents.json 后清空 custom capabilities

- **WHEN** 用户保存 `custom-agents.json`
- **THEN** 系统 SHALL 从 `agent-capabilities.json` 中删除所有 id 以 `custom-` 开头的条目
- **AND** 同时清空 `useAcpAgentsStore.promptCapabilitiesByAgent` 中对应条目
