## MODIFIED Requirements

### Requirement: IPC channels include domain and area

系统 SHALL 使用 `<domain>:<area>:<action>` 格式命名 request/response channel、event channel、stream port channel 和 cancel channel。

#### Scenario: Chat channels are under session chat

- **WHEN** 系统定义 chat session、chat stream 或 chat probe 相关 IPC channel
- **THEN** 对应 channel SHALL 使用 `session:chat:*` 前缀
- **AND** 系统 SHALL NOT 将 active chat IPC contract 定义为 `chat:*`

#### Scenario: Proposal run channels are split by public area

- **WHEN** 系统定义 proposal apply 或 archive 相关 IPC channel
- **THEN** apply channel SHALL 使用 `proposal:apply:*` 前缀
- **AND** archive channel SHALL 使用 `proposal:archive:*` 前缀
- **AND** proposal browser/list/status channel SHALL 使用 `proposal:browser:*` 前缀

#### Scenario: Platform and insight channels use owner domains

- **WHEN** 系统定义 settings、release、overview、specs、guidelines、lineage 或 knowledge 相关 IPC channel
- **THEN** settings/release channel SHALL 使用 `platform:<area>:*`
- **AND** overview/specs/guidelines/lineage/knowledge channel SHALL 使用 `insight:<area>:*`

#### Scenario: Knowledge review document channels are under insight knowledge

- **WHEN** 系统定义 knowledge review 文档读取、文档保存、browser state 或 maintenance 相关 IPC channel
- **THEN** 对应 channel SHALL 使用 `insight:knowledge:*` 前缀
- **AND** preload SHALL 通过 `window.api.insight.knowledge.<action>()` 暴露 renderer 可调用 API
- **AND** renderer wrapper SHALL 位于 `src/renderer/src/api/insight/knowledge.ts`
- **AND** 系统 SHALL NOT 将 knowledge review 文档读写 channel 放入 `insight:lineage:*`
