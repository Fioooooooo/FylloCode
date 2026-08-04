## MODIFIED Requirements

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
