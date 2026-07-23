# acp-agent-connection-lifecycle Specification

## Purpose

定义全局 ACP Agent 连接在主进程中的预热、复用、主动停止、配置失效与退出清理边界，并约束升级后 draft probe 清理和既有会话恢复语义。

## Requirements

### Requirement: Main 在应用 ready 后预热全部全局已安装 ACP Agent

系统 SHALL 在 main 进程完成 shell PATH 同步、migration、IPC/event 注册和首窗创建后，通过下一轮 event loop 后台发现并预热所有具有全局 installed record 的 registry Agent 与所有有效 custom Agent。系统 SHALL NOT 等待 BrowserWindow `did-finish-load` 或这些连接 ready 后才开始预热或完成 main bootstrap。

#### Scenario: 应用冷启动发现多个全局 Agent

- **WHEN** `app.whenReady()` 进入 `bootstrapReady()` 且 main 完成启动前置工作和首窗创建
- **THEN** main SHALL 通过 `setImmediate` 在下一轮 event loop 从全局 registry、installed records 和 custom Agent 配置发现全部预热目标
- **AND** main SHALL 为每个目标提交连接预热
- **AND** main SHALL NOT 等待 BrowserWindow `did-finish-load` 才启动预热
- **AND** `bootstrapReady()` SHALL 在这些 Agent 连接仍在启动时继续完成

#### Scenario: 应用启动时没有项目窗口

- **WHEN** 应用只有 Launcher window 且尚未打开任何项目
- **THEN** main SHALL 仍预热全部全局已安装 Agent 连接
- **AND** 连接预热 SHALL NOT 依赖 project ID、project path 或 renderer Agent 状态

#### Scenario: 全局安装记录已经失效

- **WHEN** installed record 或 custom catalog 中的 Agent 无法由 process pool 启动
- **THEN** 系统 SHALL 将该 Agent 的预热记录为独立失败
- **AND** 系统 SHALL 继续预热其他 Agent
- **AND** main bootstrap 与首窗 SHALL 保持可用

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

系统 SHALL 在 main 进程使用应用级预热调度器限制后台 Agent 冷启动并发，并 SHALL 让来自 app bootstrap、安装或配置 mutation、draft probe 和正常 chat 的同一 Agent 连接请求最终复用同一个 process pool entry。

#### Scenario: App bootstrap 与 Agent mutation 重复提交

- **WHEN** app bootstrap 和一个 Agent mutation 同时提交同一 Agent 的预热
- **THEN** main warmup coordinator 与 ACP process pool SHALL 将该 Agent 合并为一个启动
- **AND** 两个调用 SHALL 观察到同一个 ready 或 failed 结果

#### Scenario: 多个慢 Agent 同时等待预热

- **WHEN** 全局已安装 Agent 数量超过预热调度器的并发上限
- **THEN** 系统 SHALL 将超出上限的 Agent 保留在后台队列
- **AND** 当前用户选择触发的 probe SHALL NOT 必须等待该后台队列轮到对应 Agent

#### Scenario: 单个 Agent 预热失败

- **WHEN** 某个 Agent spawn 或 `initialize` 失败
- **THEN** 该失败 SHALL NOT 使其他 Agent 的预热失败
- **AND** 该失败 SHALL NOT 使 main bootstrap、窗口创建或已可用 Agent 不可用

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

所有通过 app bootstrap 预热、mutation 预热、probe 或 chat 创建的 ACP Agent 进程 SHALL 继续归应用级 lifecycle 所有。应用退出时，warmup coordinator SHALL 在 process pool dispose 前取消尚未触发的首次调度和排队任务；process pool SHALL 拒绝 shutdown 开始后的新启动，并统一释放 session handlers、transport 和子进程。

#### Scenario: 应用退出时存在未使用的预热 Agent

- **WHEN** 应用退出且 process pool 中存在从未创建 session 的预热连接
- **THEN** disposer SHALL 关闭其 transport 并终止子进程
- **AND** 系统 SHALL NOT 遗留 detached Agent 进程

#### Scenario: 应用在首次调度或队列完成前退出

- **WHEN** 应用退出时首次预热的 `setImmediate` 尚未触发或 warmup 队列仍有未启动 Agent
- **THEN** warmup coordinator SHALL 取消该 Immediate 和全部未启动队列项
- **AND** process pool SHALL 拒绝 shutdown 后到达的 `getOrStartProcess` 请求
- **AND** 系统 SHALL NOT 在 process pool dispose 后 spawn 新 Agent 进程
