# fyllo-spawn Specification

## Purpose

定义 FylloCode 通过 HTTP-only bundled MCP 将可信父 Session 的工作委派给复用现有 ACP runtime 的 spawned Sessions，并约束 Workspace 归属、并发、持久化、超时、响应分段和生命周期清理。

## Requirements

### Requirement: fyllo-spawn 只向具备 HTTP MCP 能力的 fyllocode Chat 提供四个 tools

系统 SHALL 将 `fyllo-spawn` 注册为 HTTP-only bundled MCP server，并 SHALL 提供 `available_agents`、`prompt_to_agent`、`check_session_status` 与 `read_response` 四个 tools。`native` Chat、缺少 HTTP MCP 能力的 Agent或 fyllo-spawn backend 不可用的 activation SHALL 不获得该 server。

#### Scenario: 支持 HTTP 的 fyllocode Chat

- **WHEN** fyllocode Chat 创建 ACP activation，Agent 声明 HTTP MCP capability且 fyllo-spawn backend ready
- **THEN** activation SHALL 获得 fyllo-spawn HTTP spec和四个 tools
- **AND** SHALL NOT 为该 activation 创建 fyllo-spawn stdio child

#### Scenario: Agent 不支持 HTTP

- **WHEN** fyllocode Chat 的 Agent 不声明 HTTP MCP capability
- **THEN** activation SHALL 省略 fyllo-spawn
- **AND** 其他允许 stdio fallback 的 bundled MCP server SHALL 继续按各自 policy工作

### Requirement: available_agents 只读取已安装 Agent目录

`available_agents` SHALL 返回当前已安装 registry Agent与有效 custom Agent的 `agentId`、显示名称和简短描述，SHALL NOT 为列表查询启动 AgentProcess或创建 ACP Session，且 SHALL NOT 返回 session config options。列表 MAY 包含与调用方同类型的 Agent；spawned ACP Session不获得 fyllo-spawn，因此 SHALL NOT 形成递归派生。

#### Scenario: 查询已安装 Agent

- **WHEN** 当前目录包含两个已安装 registry Agent和一个有效 custom Agent
- **THEN** `available_agents` SHALL 返回三个条目
- **AND** SHALL NOT 调用 ACP `initialize`、`newSession` 或 draft probe

#### Scenario: Agent 未安装

- **WHEN** registry中存在但未安装的 Agent
- **THEN** `available_agents` SHALL 不返回该 Agent

### Requirement: Tool 调用方身份只来自可信 Workspace 请求上下文

fyllo-spawn SHALL 从 Main proxy 注入的 `McpWorkspaceDescriptorV2` 请求上下文取得 `workspaceId` 与父 `fylloSessionId`，并 SHALL NOT 接受 tool 参数、caller header或进程级环境变量覆盖该身份。每次续聊、状态查询和响应读取 SHALL 校验 spawned Session属于同一 `{ workspaceId, parentSessionId }`；不匹配时 SHALL 返回 `not_found`且不泄露目标是否存在。

#### Scenario: Agent 不提供父 Session参数

- **WHEN** Agent 调用 `prompt_to_agent` 且 tool input只包含 agentId、prompt和可选 spawned session/config
- **THEN** fyllo-spawn SHALL 从可信请求上下文取得父 Session identity
- **AND** Agent SHALL 无需知道或提交父 fylloSessionId

#### Scenario: 请求上下文缺少 Session

- **WHEN**可信 descriptor不包含 sessionId
- **THEN** tool SHALL 返回 `SPAWN_PARENT_SESSION_REQUIRED`
- **AND** SHALL NOT 创建任何内存 entry或磁盘目录

#### Scenario: 跨父 Session猜测 spawned ID

- **WHEN** 当前调用方提交属于其他 Workspace或父 Session的 spawnedSessionId
- **THEN** tool SHALL 返回 `not_found`
- **AND** SHALL NOT返回 activity、error、config、responseId或文件内容

### Requirement: Spawned ACP Session 固定继承父 Chat Session的 multi-root 授权

Main SHALL 根据可信 caller identity加载父 Chat Session meta，重新校验其 `SessionWorkspaceSnapshot`，并使用该 snapshot的 `cwd` 与 `additionalDirectories` 创建 spawned ACP Session。Main SHALL 在创建前复用现有 Agent Workspace compatibility校验；SHALL NOT 使用 MCP child回传的 path、当前 Workspace的新成员集合或 primary fallback扩大授权。

#### Scenario: Collection Workspace创建 spawned Session

- **WHEN** 父 Session snapshot包含 primary和两个 additional Folder且仍全部有效
- **THEN** spawned `newSession` SHALL使用 snapshot primary path作为 cwd
- **AND** SHALL按 snapshot顺序传递两个 additionalDirectories
- **AND** spawned meta SHALL持久化同一固定 snapshot

#### Scenario: 父 snapshot stale

- **WHEN** 父 Session成员已被移除、缺失或重定位
- **THEN** `prompt_to_agent` SHALL在启动或取得 AgentProcess前返回现有对应 stale error
- **AND** SHALL NOT裁剪 snapshot或创建 spawned Session

#### Scenario: 目标 Agent不支持 additional directories

- **WHEN**父 snapshot包含 additionalDirectories且目标 Agent capability不是 supported
- **THEN** `prompt_to_agent` SHALL返回现有 `PROMPT_CAPABILITY_MISMATCH`
- **AND** SHALL NOT发送 ACP prompt

### Requirement: Spawned Session 复用现有 ACP runtime且采用 Phase 1最小注入策略

系统 SHALL 复用全局 ACP process pool、`AcpSession` activation/cancel/config与统一 SessionEvent映射。spawned ACP Session SHALL使用空 bundled MCP list和空 FylloCode system reminder，并 SHALL沿用当前 ACP connection的 `allow_once` permission策略；系统 SHALL NOT为 spawned Session创建第二个 AgentProcess池或独立 ACP协议实现。

#### Scenario: 目标 AgentProcess已经 ready

- **WHEN** `prompt_to_agent`选择的 agentId已有 ready AgentProcess
- **THEN** spawned Session SHALL复用该 connection创建新的 ACP Session
- **AND** SHALL NOT spawn第二个相同 agentId进程

#### Scenario: 创建 spawned ACP Session

- **WHEN** Main调用 ACP `newSession`
- **THEN** mcpServers SHALL为空且首轮 prompt SHALL不包含 FylloCode system reminder
- **AND** permission request SHALL继续采用现有 `allow_once`选择逻辑

### Requirement: prompt_to_agent 支持新建、续聊与 config override

`prompt_to_agent` SHALL在省略 spawned sessionId时创建新 Session，在提供 owner-matched spawned sessionId时继续当前进程世代仍 active的 ACP Session。新 Session SHALL以 `newSession().configOptions`作为首次 config主要来源；config override SHALL在 prompt前按 option id、类型与候选值验证并逐项设置。设置失败 SHALL不阻断 prompt，但 SHALL通过结构化 warnings返回。

#### Scenario: 首次 prompt返回 config

- **WHEN** `newSession`返回 model与thought level config options且 prompt成功
- **THEN** tool结果 SHALL包含 spawned sessionId、完成响应和精简 config snapshot
- **AND** SHALL NOT等待异步 config update才发送 prompt

#### Scenario: 首轮指定 config

- **WHEN**调用方在新 Session请求中提交 `config: { model: "o3" }`且该值属于 `newSession`返回候选
- **THEN** Main SHALL在发送 prompt前调用现有 set-config-option RPC
- **AND**完成结果 SHALL反映成功应用后的 current value

#### Scenario: config设置失败

- **WHEN**一个合法 config override被 Agent拒绝但 ACP Session仍可 prompt
- **THEN**系统 SHALL继续发送 prompt
- **AND**结果 SHALL包含该 option的 warning且不得声称设置成功

### Requirement: 系统只限制瞬时并发而不限制累计 spawned Session

同一 spawned Session SHALL同时最多运行一个 active turn；单个父 Session SHALL同时最多运行4个 spawned turns，全应用 SHALL同时最多运行8个 spawned turns。系统 SHALL不限制累计创建的 spawned Session数量或父 Session使用时长，且 SHALL不因达到 resident idle软目标拒绝新 Session。

#### Scenario: 同一 Session已有 active turn

- **WHEN**同一 owner再次向仍在 running或cancelling的 spawned Session发送 prompt
- **THEN** `prompt_to_agent` SHALL立即返回 `busy`
- **AND** SHALL包含 startedAt与lastActivityAt且不排队第二个 turn

#### Scenario: 达到父 Session并发上限

- **WHEN**同一父 Session已有4个 active spawned turns并请求第五个
- **THEN**系统 SHALL返回 retryable `SPAWN_CAPACITY_EXCEEDED`
- **AND**现有4个 turns SHALL继续运行

#### Scenario: 长期顺序创建 Session

- **WHEN**父 Session长期运行并已累计完成超过任意 resident idle软目标数量的 spawned Sessions
- **THEN**系统 SHALL仍允许在 active容量可用时创建新 Session
- **AND** MAY LRU卸载 idle内存 entry但 SHALL保留磁盘历史

### Requirement: Inactivity watchdog 取消无进展 turn

每个 active turn SHALL设置10分钟无 ACP activity watchdog，并 SHALL在匹配 Session的文本、reasoning、tool start/update、usage等有效进展到达时刷新 lastActivityAt和重置 timer。超时后系统 SHALL调用 ACP `session/cancel`并等待5秒；SHALL NOT因该 Session超时终止共享 AgentProcess。

#### Scenario: 长 turn持续产生进展

- **WHEN**一个 turn运行超过10分钟但每次间隔不足10分钟持续产生有效 ACP activity
- **THEN**watchdog SHALL持续重置
- **AND**系统 SHALL NOT仅因绝对运行时长取消 turn

#### Scenario: 无活动超时且取消确认

- **WHEN**turn连续10分钟无 activity且 ACP prompt在 cancel后的5秒内结算
- **THEN**tool SHALL以 `TURN_INACTIVITY_TIMEOUT`结束
- **AND**系统 SHALL清理 timer、handler与active容量计数

#### Scenario: 取消未确认

- **WHEN**turn连续10分钟无 activity且 cancel后5秒仍未结算
- **THEN**Session SHALL进入不可续用 error状态并返回 `TURN_CANCEL_UNCONFIRMED`
- **AND**迟到事件 SHALL被丢弃且后续 prompt SHALL NOT复用该 ACP Session

### Requirement: Spawned 对话与响应持久化在父 Session子目录

系统 SHALL将 spawned meta、完整 `UIMessage` JSONL和不可变 turn response写入 `sessionDir(workspaceId, parentSessionId)/spawn/<spawnedSessionId>/`。每轮 SHALL先持久化主 Agent发送给子 Agent的 `role=user` prompt，再持久化统一 MessageAssembler产生的 assistant message。meta SHALL使用versioned schema和原子替换，单 Session写入 SHALL串行。

#### Scenario: 成功完成一轮 prompt

- **WHEN**主 Agent向子 Agent发送 prompt并收到 assistant输出
- **THEN**messages.jsonl SHALL按顺序包含 role=user prompt和role=assistant message
- **AND**responses目录 SHALL新增以 responseId标识且之后不覆盖的 Markdown结果
- **AND**meta SHALL更新turnCount、tokenUsage、latestResponseId与updatedAt

#### Scenario: prompt失败并产生部分输出

- **WHEN**ACP prompt在产生部分 assistant事件后失败
- **THEN**系统 SHALL保留 user prompt与已组装的部分 assistant message
- **AND**meta SHALL记录稳定 error code/message而不伪报 idle完成

### Requirement: 小响应内联而大响应通过 read_response安全分段读取

`prompt_to_agent` SHALL直接返回最多24 KiB的UTF-8安全响应前缀、responseId、truncated与可选nextCursor。`read_response` SHALL按opaque cursor读取同一不可变 response，默认块大小24 KiB且服务端最大64 KiB；SHALL不向 Agent暴露或接受app-data绝对路径。

#### Scenario: 响应不超过inline上限

- **WHEN**完成响应的UTF-8大小不超过24 KiB
- **THEN** `prompt_to_agent` SHALL返回完整content且truncated为false
- **AND** SHALL不要求调用 `read_response`

#### Scenario: 响应超过inline上限

- **WHEN**完成响应超过24 KiB
- **THEN** `prompt_to_agent` SHALL返回安全前缀、responseId、truncated为true和nextCursor
- **AND**主 Agent SHALL可连续调用 `read_response`直到done为true

#### Scenario: cursor或response归属无效

- **WHEN** `read_response`收到非法cursor、未知responseId或非当前owner的Session
- **THEN**系统 SHALL拒绝读取且不得接受caller提供的文件路径
- **AND**跨owner目标 SHALL投影为not_found

### Requirement: 状态、process invalidation与idle重载具有明确语义

`check_session_status` SHALL返回 `not_found`、`running`、`idle`、`error`或`expired`。running SHALL返回最多3条recentActivity、startedAt与lastActivityAt；idle SHALL返回latestResponseId；error SHALL返回稳定code/message。AgentProcess任意退出、升级、卸载或generation变化 SHALL立即使其 spawned ACP Sessions失效，自动重启的新进程 SHALL NOT继承旧 Session。

#### Scenario: 并行查询运行状态

- **WHEN**一个 spawned Session正在运行且同一owner通过另一并发tool call查询状态
- **THEN**系统 SHALL返回running及当前activity snapshot
- **AND**查询 SHALL不等待运行中prompt完成

#### Scenario: AgentProcess退出并自动重启

- **WHEN**承载 spawned Session的AgentProcess退出且process pool随后创建新generation
- **THEN**旧 spawned Session SHALL返回expired或对应active turn error
- **AND**系统 SHALL NOT在新connection上静默resume/load旧ACP Session

#### Scenario: idle entry从内存卸载

- **WHEN**owner续聊一个已LRU卸载但磁盘meta仍存在的 spawned Session
- **THEN**Main SHALL只用现有ready process和active ACP Session映射尝试恢复
- **AND** SHALL NOT为了恢复调用会启动新AgentProcess的API

### Requirement: 父 Session删除与应用退出阻止迟到写入

父 Chat Session删除 SHALL先建立spawn deletion fence、拒绝新请求、取消关联active turns，并在最多5秒结算窗口后删除整个父 `sessionDir`。应用退出 SHALL在现有quiesce阶段fence新spawn、清理watchdog并取消active turns，且 SHALL在ACP process pool terminate前完成 spawned manager结算。任何迟到事件 SHALL NOT重新创建已删除或已shutdown的目录。

#### Scenario: 删除包含运行中spawn的父 Session

- **WHEN**用户删除父 Session且其下仍有active spawned turn
- **THEN**系统 SHALL先fence该父 Session并请求取消turn
- **AND**最迟在5秒结算窗口后继续删除父Session目录
- **AND**迟到ACP事件 SHALL被丢弃且不得重建spawn目录

#### Scenario: 应用正常退出

- **WHEN**集中shutdown进入quiesce
- **THEN**新的spawn RPC SHALL被拒绝且全部watchdog SHALL被清理
- **AND**active spawned turns SHALL在ACP process pool terminate前收到cancel
- **AND**整个清理 SHALL共享现有应用级总deadline
