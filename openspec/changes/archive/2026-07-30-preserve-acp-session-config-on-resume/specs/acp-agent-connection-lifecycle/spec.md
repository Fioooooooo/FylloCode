## ADDED Requirements

### Requirement: 持久化 ACP session 配置跨 cold connection 恢复

系统 SHALL 将 session meta 中最后一次由 Agent 确认的完整 `configOptions` 作为该 FylloCode session 的 cold recovery 期望配置。应用重启、Agent process 重建或其他 connection-local session 状态丢失后，系统 SHALL 在首个续聊 prompt 前先激活目标 ACP session，并通过 `session/set_config_option` 恢复所有仍受当前 Agent schema 支持的持久化选值。

#### Scenario: 应用重启后 resume 返回默认配置

- **WHEN** session meta 保存了非默认配置且应用重启后的 Agent 支持 `resumeSession`
- **AND** `resumeSession` 返回同一 option schema 但 currentValue 为 Agent 默认值
- **THEN** 系统 SHALL 在发送首个 prompt 前把持久化选值重放到该 ACP session
- **AND** 系统 SHALL 只在 Agent 确认最终配置后更新 renderer 与 session meta

#### Scenario: loadSession 返回默认配置

- **WHEN** cold session 不支持 resume 但支持 `loadSession`
- **AND** `loadSession` 返回的兼容 option 使用默认 currentValue
- **THEN** 系统 SHALL 在 replay 结束后、发送首个 prompt 前恢复持久化选值
- **AND** 历史 replay suppression 与消息去重语义 SHALL 保持不变

#### Scenario: fresh fallback 创建新 ACP session

- **WHEN** 已持久化 ACP session 无法 resume 或 load 且 recovery 创建 fresh ACP session
- **THEN** 系统 SHALL 在 fresh session 的首个 prompt 前把仍受新 session schema 支持的持久化选值应用到新 ACP session
- **AND** existing persisted history reminder 与 system reminder SHALL 继续只注入一次

#### Scenario: cold process 不先发送 direct prompt

- **WHEN** session meta 存在 ACP session ID 但当前 Agent process 未激活该 session
- **THEN** 系统 SHALL NOT 使用该 ID 先发送 direct prompt
- **AND** 系统 SHALL 先进入 resume、load 或 fresh newSession recovery

#### Scenario: warm process 继续已有 session

- **WHEN** 目标 ACP session 已在当前 Agent process 中激活且持久化配置没有新的待恢复状态
- **THEN** 系统 SHALL 继续使用 direct prompt
- **AND** 系统 SHALL NOT 在每个 turn 重复重放全部配置

### Requirement: 配置恢复以 Agent 完整 live snapshot 逐步收敛

系统 SHALL 按持久化 option 顺序串行恢复配置。每次 `session/set_config_option` 响应中的完整 `configOptions` SHALL 成为下一步校验与恢复的 live snapshot；系统 SHALL 重新评估依赖变化，直到所有兼容选值与持久化期望一致。系统 MUST 对重复 snapshot 或有限迭代内无法收敛的恢复中止 prompt，不得无限调用 Agent。

#### Scenario: model 变化重塑 thought level schema

- **WHEN** 持久化配置同时包含 model 与 thought level
- **AND** 恢复 model 后 Agent 返回了变化后的 thought level options
- **THEN** 系统 SHALL 使用新的完整 response 校验持久化 thought level
- **AND** 仅当该 value 在新 schema 中仍有效时恢复 thought level

#### Scenario: Agent 响应缺少 configOptions

- **WHEN** lifecycle response 未携带 `configOptions` 但 session meta 存在持久化配置
- **THEN** 系统 SHALL NOT 把缺失字段归一化为空数组并覆盖 session meta
- **AND** 系统 SHALL 使用持久化 option schema 发起恢复 RPC，以 Agent 的完整 set response 建立 live snapshot

#### Scenario: 配置已经一致

- **WHEN** lifecycle response 中某个 option 的 ID、type 与 currentValue 已和持久化期望一致
- **THEN** 系统 SHALL NOT 为该 option 发送冗余 set RPC
- **AND** 该 option SHALL 保留在最终完整 snapshot 中

#### Scenario: 恢复无法收敛

- **WHEN** 依赖 option 相互重置导致 live snapshot 重复或超过有限迭代上限
- **THEN** 系统 SHALL 终止当前恢复并返回 ACP stream error
- **AND** 系统 SHALL NOT 发送本轮用户 prompt
- **AND** session meta SHALL 保留恢复前的持久化配置

### Requirement: Agent schema 变化采用兼容降级

系统 SHALL 只重放当前 Agent schema 仍支持的持久化 option。对于已删除 option、type 已变化或 select value 已失效的配置，系统 SHALL NOT 发送无效 set RPC；系统 SHALL 记录包含 session、config ID 与原因的结构化 warning，继续恢复其他兼容 option，并在完成后以 Agent 最终 live snapshot 更新 renderer 与 session meta。

#### Scenario: Agent 升级删除一个 option

- **WHEN** 持久化配置包含一个新 Agent schema 已不再提供的 option
- **THEN** 系统 SHALL NOT 对该 config ID 调用 `session/set_config_option`
- **AND** 其他兼容配置 SHALL 继续恢复
- **AND** 最终 session meta SHALL 采用不包含该 option 的 Agent live snapshot

#### Scenario: Agent 升级改变 option type

- **WHEN** 同一 config ID 的持久化 type 与 live type 不同
- **THEN** 系统 SHALL NOT 使用旧 type/value 调用 Agent
- **AND** 最终配置 SHALL 使用 Agent 当前 type 与 currentValue

#### Scenario: 持久化 select value 已失效

- **WHEN** persisted currentValue 不存在于 live flat 或 grouped options
- **THEN** 系统 SHALL NOT 发送该失效 value
- **AND** 最终配置 SHALL 使用 Agent 当前合法值

#### Scenario: 合法恢复 RPC 失败

- **WHEN** persisted option 与 live schema 兼容但 `session/set_config_option` 返回 method、transport 或 Agent error
- **THEN** 系统 SHALL 终止当前恢复并返回 existing ACP stream error
- **AND** 系统 SHALL NOT 发送首个 prompt或用未确认默认值覆盖 session meta

### Requirement: Cold session 配置修改先恢复 Agent session

用户在应用重启后、首个 prompt 前修改已有 session 配置时，系统 SHALL 先使用当前 Agent process 激活持久化 ACP session并恢复已有兼容配置，再应用用户本次 config change。该无 prompt 路径 SHALL 只使用 resume/load，不得创建缺少 reminder context 的 fresh session。

#### Scenario: Cold session 支持 resume

- **WHEN** 用户在 cold session 首个 prompt 前修改 config option
- **AND** Agent 支持并接受 `resumeSession`
- **THEN** 系统 SHALL 先 resume 并恢复 session meta 中的兼容配置
- **AND** 系统 SHALL 随后应用用户本次 value
- **AND** Agent 返回的最终完整 snapshot SHALL 写入 session meta

#### Scenario: Cold session 只能 load

- **WHEN** 用户在 cold session 首个 prompt 前修改 config option
- **AND** Agent 不支持 resume 但支持并接受 `loadSession`
- **THEN** 系统 SHALL 在不向 renderer 重放历史消息的情况下激活 session
- **AND** 系统 SHALL 恢复已有兼容配置后应用用户本次 value

#### Scenario: Cold mutation 需要 fresh fallback

- **WHEN** cold session 无法通过 resume 或 load 激活
- **THEN** 配置修改 SHALL 返回 existing ACP error且不修改 session meta
- **AND** 系统 SHALL NOT 从配置修改路径创建 fresh ACP session
- **AND** 后续用户 prompt SHALL 仍可进入标准 fresh fallback 与 history reminder 流程

### Requirement: 无持久化配置的会话保持现有行为

当旧 session meta 不包含 `configOptions` 或其值为空时，系统 SHALL 保持当前 Agent lifecycle response 与 prompt recovery 行为，不得构造配置恢复 RPC或要求数据迁移。

#### Scenario: 旧 session meta 没有 configOptions

- **WHEN** 应用加载一个创建于 configOptions 持久化之前的 session
- **THEN** 系统 SHALL 按现有 resume、load、fresh fallback 顺序恢复
- **AND** 系统 SHALL NOT 调用 `session/set_config_option`
- **AND** Agent 返回的 live configOptions SHALL 正常成为新的 session meta
