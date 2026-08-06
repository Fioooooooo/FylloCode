## MODIFIED Requirements

### Requirement: 持久化 ACP session 配置跨 cold connection 恢复

系统 SHALL将 Session meta中最后一次由 Agent确认的完整 `configOptions`作为该 Chat Session的 cold recovery期望配置。应用重启、Agent process重建或其他 connection-local session状态丢失后，系统 SHALL在首个续聊 prompt前先激活目标 ACP session，并通过 `session/set_config_option`恢复所有仍受当前 Agent schema支持的持久化选值。`fyllocode` Session在 fresh fallback时 SHALL继续按现有规则注入一次 persisted history reminder与 system reminder；`native` Session SHALL恢复配置但 SHALL NOT注入任一 reminder。

#### Scenario: 应用重启后 resume 返回默认配置

- **WHEN** Session meta保存了非默认配置且应用重启后的 Agent支持 `resumeSession`
- **AND** `resumeSession`返回同一 option schema但 currentValue为 Agent默认值
- **THEN** 系统 SHALL在发送首个 prompt前把持久化选值重放到该 ACP session
- **AND** 系统 SHALL只在 Agent确认最终配置后更新 renderer与 Session meta

#### Scenario: loadSession 返回默认配置

- **WHEN** cold Session不支持 resume但支持 `loadSession`
- **AND** `loadSession`返回的兼容 option使用默认 currentValue
- **THEN** 系统 SHALL在 replay结束后、发送首个 prompt前恢复持久化选值
- **AND** 历史 replay suppression与消息去重语义 SHALL保持不变

#### Scenario: FylloCode fresh fallback 创建新 ACP session

- **WHEN** `fyllocode` Session的持久化 ACP session无法 resume或load且 recovery创建 fresh ACP session
- **THEN** 系统 SHALL在 fresh session的首个 prompt前把仍受新 session schema支持的持久化选值应用到新 ACP session
- **AND** existing persisted history reminder与 system reminder SHALL继续只注入一次

#### Scenario: Native fresh fallback 创建新 ACP session

- **WHEN** `native` Session的持久化 ACP session无法 resume或load且 recovery创建 fresh ACP session
- **THEN** 系统 SHALL在 fresh session的首个 prompt前恢复仍受支持的持久化选值
- **AND** SHALL NOT注入 persisted history reminder或 FylloCode system reminder

#### Scenario: cold process 不先发送 direct prompt

- **WHEN** Session meta存在 ACP session ID但当前 Agent process未激活该 session
- **THEN** 系统 SHALL NOT使用该 ID先发送 direct prompt
- **AND** 系统 SHALL先进入 resume、load或 fresh newSession recovery

#### Scenario: warm process 继续已有 session

- **WHEN** 目标 ACP session已在当前 Agent process中激活且持久化配置没有新的待恢复状态
- **THEN** 系统 SHALL继续使用 direct prompt
- **AND** 系统 SHALL NOT在每个 turn重复重放全部配置
