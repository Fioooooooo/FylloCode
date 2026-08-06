# acp-agent-connection-lifecycle Specification

## Purpose

定义全局 ACP Agent 连接在主进程中的预热、复用、主动停止、配置失效与退出清理边界，并约束升级后 draft probe 清理和既有会话恢复语义。

## Requirements

### Requirement: Main 在应用 ready 后预热全部全局已安装 ACP Agent

系统 SHALL 在 main 进程完成 shell PATH、required gate、IPC/event 注册和正式 renderer handoff 后，等待 renderer 首次 interactive signal或 formal renderer load 后的有限 fallback，再后台发现并预热所有具有全局 installed record 的 registry Agent 与所有有效 custom Agent。系统 SHALL NOT 等待这些连接 ready 后才完成 renderer critical bootstrap或保持应用可交互。

#### Scenario: 应用冷启动发现多个全局 Agent

- **WHEN** required gate 和 runtime wiring 已完成且 renderer 首次报告 interactive
- **THEN** main SHALL 从全局 registry、installed records 和 custom Agent 配置发现全部预热目标
- **AND** main SHALL 为每个目标提交连接预热
- **AND** main SHALL NOT 等待 Agent ready 才保持 Launcher/Workspace 可交互

#### Scenario: Renderer interactive signal 丢失

- **WHEN** formal renderer 已完成 document load 但未在有限 fallback 窗口内报告 interactive
- **THEN** main SHALL 仍提交一次全局 installed/custom Agent warmup
- **AND** 后续迟到 signal SHALL 与已有 batch 幂等合并

#### Scenario: 应用启动时没有项目窗口

- **WHEN** 应用只有 Launcher window 且尚未打开任何项目
- **THEN** main SHALL 仍预热全部全局已安装 Agent 连接
- **AND** 连接预热 SHALL NOT 依赖 project ID、project path 或 renderer Agent store 状态

#### Scenario: 全局安装记录已经失效

- **WHEN** installed record 或 custom catalog 中的 Agent 无法由 process pool 启动
- **THEN** 系统 SHALL 将该 Agent 的预热记录为独立失败
- **AND** 系统 SHALL 继续预热其他 Agent
- **AND** main runtime、窗口与已可用 Agent SHALL 保持可用

### Requirement: Main mutation 成功后增量预热 Agent

系统 SHALL 在 Agent 首次安装或升级成功后由 main service 提交该 Agent 的连接预热，并 SHALL 在 custom Agent 配置保存成功后提交新增、变更或仍有效的 custom Agent。该增量预热 SHALL NOT 依赖 renderer 状态刷新或新增 IPC。

#### Scenario: 首次安装成功

- **WHEN** main installer 成功安装一个此前没有 installed record 的 Agent
- **THEN** main service SHALL 将该 Agent 提交连接预热
- **AND** renderer SHALL NOT 需要回传 Agent ID 才能触发预热

#### Scenario: Agent 升级成功

- **WHEN** main service 停止旧 Agent 进程并成功完成升级或重装
- **THEN** main SHALL 为相同 Agent ID 提交新版本连接预热
- **AND** 新连接 SHALL 使用升级后的运行时

#### Scenario: custom Agent 配置保存成功

- **WHEN** custom Agent 配置被新增或修改并成功保存
- **THEN** main SHALL 根据保存后的 catalog 提交仍有效的 custom Agent 预热
- **AND** 被删除的 custom Agent SHALL NOT 被重新预热

### Requirement: 连接预热与 draft probe 保持独立

连接预热 SHALL 只启动 Agent 进程、建立 ACP transport 并完成 `initialize`，SHALL NOT 调用 `newSession`、解析项目级 bundled MCP transport 或创建 draft probe。Session 的 `configOptions` 和 `availableCommands` SHALL 继续由当前 Agent 的 draft probe 获取。

#### Scenario: 非当前 Agent 完成预热

- **WHEN** 一个尚未被任何 Chat Empty 选择的 Agent 完成连接预热
- **THEN** 系统 SHALL 在全局 process pool 中保留其 initialized connection
- **AND** 系统 SHALL NOT 为该 Agent 创建 ACP session
- **AND** renderer SHALL NOT 将该 Agent 视为已经拥有 session config 或 commands

#### Scenario: 用户切换到已经预热的 Agent

- **WHEN** 用户在任一项目的 Chat Empty Agent Picker 中选择一个已经预热的 Agent
- **THEN** draft probe SHALL 复用该 Agent 的现有 initialized connection
- **AND** draft probe SHALL 通过自己的 `newSession` 取得 session config 和 commands

#### Scenario: 用户切换到正在预热的 Agent

- **WHEN** 用户选择的 Agent 仍在执行连接预热
- **THEN** draft probe SHALL 加入同一个在途 Agent 启动
- **AND** 系统 SHALL NOT 为该 Agent spawn 第二个进程

### Requirement: 预热连接由 main 进程全局限流并复用

系统 SHALL 在 main 进程使用应用级预热调度器限制后台 Agent 冷启动并发，并 SHALL 让来自 app bootstrap、安装或配置 mutation、draft probe 和正常 chat 的同一 Agent 连接请求最终复用同一个 process pool entry。后台队列 SHALL NOT 阻塞用户主动 probe/chat 对目标 Agent 的直接 process-pool 请求。

#### Scenario: App bootstrap 与 Agent mutation 重复提交

- **WHEN** app bootstrap 和一个 Agent mutation 同时提交同一 Agent 的预热
- **THEN** main warmup coordinator 与 ACP process pool SHALL 将该 Agent 合并为一个启动
- **AND** 两个调用 SHALL 观察到同一个 ready 或 failed 结果

#### Scenario: 多个慢 Agent 同时等待预热

- **WHEN** 全局已安装 Agent 数量超过预热调度器的并发上限
- **THEN** 系统 SHALL 将超出上限的 Agent 保留在后台队列
- **AND** 当前用户选择触发的 probe/chat SHALL 能直接请求同一 process pool
- **AND** 用户请求 SHALL NOT 必须等待该后台队列轮到对应 Agent

#### Scenario: 单个 Agent 预热失败

- **WHEN** 某个 Agent spawn 或 `initialize` 失败
- **THEN** 该失败 SHALL NOT 使其他 Agent 的预热失败
- **AND** 该失败 SHALL NOT 使 main runtime、窗口或已可用 Agent 不可用

### Requirement: 运行时变更前主动停止旧 Agent 进程

系统 SHALL 在升级、卸载已安装 Agent，或删除、修改 custom Agent 的 command、args、env 前，主动停止对应 Agent 的 ready、starting 或 restarting 进程，并取消属于该 Agent 的待启动和待重启工作。主动停止 SHALL NOT 被计为异常 crash 或广播为 Agent unavailable。

#### Scenario: 升级已安装 Agent

- **WHEN** 用户对已有 installed record 的 Agent 执行安装操作
- **THEN** 系统 SHALL 将该操作视为升级或重装
- **AND** 系统 SHALL 在 installer 修改 Agent 前停止旧 Agent 进程

#### Scenario: 首次安装 Agent

- **WHEN** 用户安装一个没有 installed record 且没有运行进程的 Agent
- **THEN** 系统 SHALL 直接执行安装
- **AND** 系统 SHALL NOT 要求先停止不存在的 Agent 进程

#### Scenario: 卸载正在预热或已预热的 Agent

- **WHEN** 用户卸载一个连接正在初始化或已经 ready 的 Agent
- **THEN** 系统 SHALL 在卸载命令和删除 installed/capability record 前终止对应进程
- **AND** 该 Agent 的旧启动结果 SHALL NOT 在卸载后重新写入 process pool
- **AND** 卸载成功后 SHALL NOT 重新预热该 Agent

#### Scenario: custom Agent 启动配置变化

- **WHEN** custom Agent 被删除或其 command、args、env 任一启动配置发生变化
- **THEN** 系统 SHALL 在保存新配置前停止旧 custom Agent 进程
- **AND** 下一次预热 SHALL 使用保存后的配置启动

#### Scenario: 主动停止遇到 backoff restart

- **WHEN** Agent 正处于异常退出后的 backoff restart 等待期且用户升级、卸载或修改其配置
- **THEN** 系统 SHALL 取消旧版本或旧配置对应的 restart
- **AND** 主动停止 SHALL 清除阻止新版本再次尝试的旧 give-up 状态

### Requirement: Agent 进程失效时清理 draft probe

系统 SHALL 在 Agent 进程因升级、卸载、配置变更或不可用而失效时，删除该 Agent 在所有项目中的 draft probe entry 和旧 session handler，并通过现有 project-scoped probe update 将对应 renderer snapshot 清空。

#### Scenario: 升级前存在 ready probe

- **WHEN** 某个 Agent 在一个或多个项目中存在 ready draft probe 且系统开始升级该 Agent
- **THEN** 系统 SHALL 删除这些 probe 对旧 `acpSessionId` 的引用
- **AND** 每个受影响项目窗口 SHALL 收到自己的 probe snapshot 清空事件
- **AND** 其他 Agent 的 probe SHALL 保持不变

#### Scenario: 主动失效不是 unavailable

- **WHEN** Agent 因升级或配置变更被系统主动停止
- **THEN** session probe SHALL 被清理
- **AND** platform Agent 状态 SHALL NOT 因此次主动停止被标记为 crash unavailable

### Requirement: Agent 升级后沿用既有会话恢复流程

系统 SHALL 在 Agent 升级和旧进程停止期间保留 FylloCode session、已持久化 ACP session ID 与消息历史。用户升级后继续已有对话时，系统 SHALL 使用升级后连接并继续执行现有的 `resumeSession`、`loadSession`、fresh `newSession` fallback 恢复顺序。

#### Scenario: 升级后 Agent 支持 resume

- **WHEN** 用户升级 Agent 后向已有会话发送下一条消息
- **AND** 新版本 Agent 宣告支持 resume 且接受已持久化 ACP session ID
- **THEN** 系统 SHALL 优先调用 `resumeSession`
- **AND** 系统 SHALL NOT 因进程升级删除该会话的持久化标识或历史

#### Scenario: 升级后 resume 或 load 不可用

- **WHEN** 升级后的 Agent 无法 resume 或 load 已持久化 ACP session
- **THEN** 系统 SHALL 沿用现有 recovery fallback 创建 fresh ACP session
- **AND** 系统 SHALL 沿用现有 persisted history reminder 机制恢复对话上下文

#### Scenario: 升级发生在 prompt 执行期间

- **WHEN** 用户在 Agent 正执行 prompt 时触发升级并导致旧进程终止
- **THEN** 当前 turn SHALL 沿用现有 stream 错误或取消语义结束
- **AND** 系统 SHALL NOT 承诺将该在途 turn 无缝迁移到升级后进程
- **AND** 后续 turn SHALL 进入既有会话恢复流程

### Requirement: 应用退出清理全部预热连接

所有通过 app bootstrap 预热、mutation 预热、probe 或 chat 创建的 ACP Agent 进程 SHALL 继续归应用级 lifecycle 所有。应用退出的 `quiesce` phase SHALL 先取消 warmup 首次/fallback 调度和未启动队列、拒绝新 Agent 工作并 cancel session；后续 `terminate` phase SHALL 并行释放 process pool 与其他独立 OS resources。Process pool SHALL 统一释放 session handlers、transport 和子进程，并提供总 deadline 后的明确 force termination。

#### Scenario: 应用退出时存在未使用的预热 Agent

- **WHEN** 应用退出且 process pool 中存在从未创建 session 的预热连接
- **THEN** terminate task SHALL 关闭其 transport并终止子进程
- **AND** 系统 SHALL NOT 遗留 detached Agent 进程

#### Scenario: 应用在首次调度或队列完成前退出

- **WHEN** 应用退出时 interactive fallback 尚未触发或 warmup 队列仍有未启动 Agent
- **THEN** quiesce phase SHALL 取消 fallback timer 和全部未启动队列项
- **AND** process pool SHALL 拒绝 shutdown fence 后到达的 `getOrStartProcess` 请求
- **AND** 系统 SHALL NOT 在 process pool dispose 后 spawn 新 Agent 进程

#### Scenario: ACP graceful close 超过总 deadline

- **WHEN** Agent transport、session close 或子进程未在应用级 shutdown deadline 内结算
- **THEN** ACP process pool SHALL 对已知 Agent process group 执行 force termination
- **AND** main SHALL 记录未完成 Agent cleanup task但不得无限等待

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

### Requirement: ACP Client 声明 boolean session config option 支持

系统 SHALL 在 ACP process pool 为 Agent 建立连接并调用 `initialize` 时，在 `clientCapabilities.session.configOptions.boolean` 发送空 marker object。系统 SHALL 在不升级当前 ACP SDK 的前提下发送该 marker，并继续复用既有 boolean config option 归一化、设置、持久化和恢复链路。

#### Scenario: 冷启动或预热建立 Agent 连接

- **WHEN** ACP process pool 为任意 registry 或 custom Agent 调用 `initialize`
- **THEN** initialize 请求 SHALL 包含 `clientCapabilities.session.configOptions.boolean: {}`
- **AND** protocol version、client info 与连接生命周期顺序 SHALL 保持不变

#### Scenario: Agent 在协商后返回 boolean option

- **WHEN** Agent 因客户端声明支持而在完整 config options snapshot 中返回 `type=boolean`
- **THEN** 系统 SHALL 将 boolean current value 提供给 renderer 配置菜单
- **AND** 用户修改该配置时 SHALL 发送 `{ type: "boolean", value: boolean }`

#### Scenario: Agent 不提供 boolean option

- **WHEN** Agent 接受 initialize 但不返回任何 boolean config option
- **THEN** draft probe、session 创建与普通 select 配置行为 SHALL 与当前行为一致
