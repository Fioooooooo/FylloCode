# workflow-provider-writeback Specification

## Purpose

定义 Workflow 对可信 parent Task 执行受控 provider 写回的边界：通过 provider capability preflight、冻结的任务上下文和 Workspace-owned 幂等记录支持字段与评论写回，并在不支持或失败时保持明确的失败语义。

## Requirements

### Requirement: Workflow task context is derived from trusted parent ownership

系统 SHALL 只从 Main 已验证的 Chat parent session `originTaskRef` 推导 workflow 的 task context。Agent 或 `trigger_workflow` input SHALL NOT 能够自报 task id、provider、workspace path 或其他 task target。需要 task 的 definition SHALL 声明 `requires` 包含 `task`；不满足时 trigger SHALL 在创建 Run 前返回 `WORKFLOW_CONTEXT_UNSUPPORTED`，且 SHALL NOT 创建 Run。

#### Scenario: Chat parent 提供 task context

- **WHEN** trusted Chat session 带有 `originTaskRef` 并触发声明 `requires: [task]` 的 workflow
- **THEN** Main SHALL 通过现有 TaskAggregator 读取该 reference 对应的任务
- **AND** SHALL 将 provider、完整 task reference、title、纯文本 description 和可用 URL 冻结到 Run snapshot

#### Scenario: Agent 不能改写 task target

- **WHEN** Agent 在 workflow YAML、prompt 或 trigger input 中提供另一个 task id/provider
- **THEN** 系统 SHALL 忽略或拒绝该自报 target
- **AND** task write SHALL 仍只路由到 parent session 的 frozen taskContext

### Requirement: Provider task writes use explicit capabilities and native values

系统 SHALL 通过现有 TaskAdapter 和 TaskAggregator 提供任务写回，不得由 Workflow runner 直接调用具体 provider client。TaskAdapter SHALL 暴露 providerId、writableFields、supportsComment，并可选实现 `writeField` 与 `writeComment`。`write.field` SHALL 只允许 capability 声明的 field，且 SHALL 将 YAML 中的字符串 value 作为 provider-native value 传递；`write.comment` 只有在 `supportsComment` 为 true 时可执行。能力缺失或不支持时，trigger SHALL 返回带 stage/feature refs 的 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`，且 SHALL NOT 创建 Run。

#### Scenario: Yunxiao field write 使用 native value

- **WHEN** workflow 的 ActionStage 使用 `write.field`、target 为 `task`，且 field 出现在 Yunxiao adapter 的 writableFields 中
- **THEN** Workflow runner SHALL 通过 TaskAggregator 调用 adapter
- **AND** adapter SHALL 使用现有 Yunxiao workitem update client 写入该原始 value
- **AND** runner SHALL 不执行跨 provider 的状态名映射

#### Scenario: Provider 不支持 field 或 comment 时提前拒绝

- **WHEN** `write.field` 的 field 不在 provider capability 中，或 `write.comment` 的 supportsComment 为 false
- **THEN** trigger SHALL 返回 `WORKFLOW_FEATURE_NOT_IMPLEMENTED` 及对应 stage/feature refs
- **AND** SHALL NOT 创建 Run、ACP session 或 provider write request

#### Scenario: Yunxiao comment capability follows the client implementation

- **WHEN** Yunxiao adapter 已接入官方工作项评论接口并声明 supportsComment 为 true
- **THEN** 合法 `write.comment` SHALL 通过 adapter 写入指定工作项
- **AND** 当该 client 能力未启用时，supportsComment SHALL 为 false 且 `write.comment` SHALL 按不支持能力拒绝

### Requirement: Write actions use simple workflow-scoped idempotency

每个 `write.field` 与 `write.comment` ActionStage SHALL 必须具有可插值的 `idempotencyKey`，并 SHALL 在 `workspaceDataDir(workspaceId)/workflows/<workflow-id>/idempotency.json` 中以 flat map 记录成功执行的 key、时间、runId 和 stageId。命中已有成功记录时，runner SHALL 跳过 provider request 并将该 Action 视为成功；provider 写入成功后 SHALL 写入记录；失败时 SHALL 不写入成功记录。该机制不承诺并发 exactly-once，不增加锁、claim、pending、TTL 或分布式事务。

#### Scenario: 重复 key 被跳过

- **WHEN** write Action 的 resolved idempotencyKey 已存在成功记录
- **THEN** runner SHALL 不调用 provider
- **AND** SHALL 记录一次跳过日志并沿 pass transition 推进

#### Scenario: 首次成功写入记录

- **WHEN** write Action 的 key 尚无成功记录且 provider 写入成功
- **THEN** runner SHALL 在 provider request 完成后写入 idempotency record
- **AND** SHALL 以已有 Action completed 语义沿 pass transition 推进

#### Scenario: provider 失败不污染成功记录

- **WHEN** provider write request 失败
- **THEN** runner SHALL 记录失败并沿已有 fail transition 或 failed 终态推进
- **AND** SHALL 保持该 key 没有成功记录

### Requirement: Provider credentials are stored only through safeStorage

provider credential store SHALL 保持现有同步 load/save/clear API 和 Workspace storage 路径，但保存内容 SHALL 是 Electron `safeStorage` 加密后的 envelope，不得写回明文。`safeStorage` 不可用时 save SHALL 失败且不得写入明文；缺失、旧明文、无法解密或 JSON 无效的内容 SHALL 按空 credentials 读取。由于当前项目没有需要兼容的线上旧版本，系统 SHALL NOT 增加迁移、扫描、备份或自动删除流程，用户重新连接时覆盖旧文件即可。

#### Scenario: 保存凭据使用加密 envelope

- **WHEN** provider service 保存 credentials 且 safeStorage 可用
- **THEN** credential file SHALL 只包含加密 envelope
- **AND** 文件内容 SHALL NOT 直接包含 provider secret 明文

#### Scenario: safeStorage 不可用时拒绝明文保存

- **WHEN** safeStorage 不可用时请求保存 provider credentials
- **THEN** save SHALL 返回错误
- **AND** SHALL NOT 创建或覆盖明文 credential file

#### Scenario: 旧明文凭据按未连接处理

- **WHEN** credential store 读取旧明文、缺失、损坏或无法解密的文件
- **THEN** load SHALL 返回空 credentials
- **AND** provider UI/service SHALL 将其视为未连接并允许用户重新连接
