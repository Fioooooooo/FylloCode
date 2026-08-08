## Why

Phase 1 的 `fyllo-spawn` 只能同步等待 spawned turn 终态：长任务会持续占用首次 MCP 调用，并且旧版 02 设计依赖已经不存在的 `responsePath`、异步 `config_option_update` 和 renderer 内存通知队列。需要在不复制 ACP turn 主干、不中断现有并发与 inactivity 约束的前提下，让可信父 Session 可以安全地发起后台 spawned turn，并在结果可读时按明确的持久化和至多一次投递语义通知父 Agent。

## What Changes

- 为 `prompt_to_agent` 增加可选 `background` 模式；默认同步行为保持不变，后台模式在 turn 已持久化、配置已应用且 ACP prompt 已提交后返回结构化 accepted snapshot。
- 将 spawned turn 的“首次 accepted”与“terminal completion”拆成同一运行句柄的两个阶段；busy、单 Session/父 Session/全局 active turn 容量、inactivity watchdog 和取消 grace 均持续持有到终态，不随首次 MCP 调用返回而释放。
- 后台首次结果只暴露 owner-scoped `sessionId`、`turnId`、`startedAt`、基于 `newSession().configOptions` 的配置 snapshot、状态和 warnings；不恢复文件路径。终态内容继续以 `responseId` 配合 `read_response` 分段读取。
- 在 Main 中持久化后台 turn 状态和父 Session 通知 outbox；renderer 事件只作为唤醒信号，窗口关闭后重开可重新拉取待处理状态，应用重启则把不能继续执行的 turn 收敛为明确的 interrupted 终态。
- 为父 Chat 增加非抢占、串行的自动 system-reminder 调度：不覆盖用户 turn、不制造并发 prompt，只能向创建该 spawned Session 的同 Workspace/父 Session 投递不含子 Agent 内容的结果引用。
- 自动通知采用至多一次语义：通知被 claim/dispatch 后不自动重试；若进程在 assistant 终态持久化前中断，则记录 `delivery_unknown`，结果仍可由父 Agent手动查询和读取。
- 明确 AgentProcess 失效、应用 shutdown/restart、取消未确认、持久化失败、父 Session 删除和窗口关闭/重开的状态语义；后台 turn 不跨应用进程继续运行。
- 保持 Phase 1 的既有边界：HTTP-only、可信父 Session、Workspace/multi-root 快照、spawned Agent 不注入 system reminder 或 bundled MCP、`allow_once`、active turn 限制 1/4/8、10 分钟 ACP inactivity 与 5 秒 cancel grace，且不增加累计 Session 数或绝对运行时长上限。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `fyllo-spawn`: 扩展 spawned Session 的后台调用、accepted/config snapshot、持久化状态、终态读取、父 Session 自动通知、至多一次投递和异常生命周期契约。

## Impact

- 共享契约与 MCP：`src/shared/fyllo-spawn-rpc.ts`、`src/mcp-servers/fyllo-spawn/**`。
- Main spawned runtime：现有 spawn RPC bridge、spawned session manager、`AcpSession`/turn driver/config recovery、Session persistence、Agent process generation、Session 删除和集中 shutdown 编排。
- Chat 通信：Session/Message 持久化服务、Chat IPC 与 preload API、renderer Chat store/bootstrap、`WorkspaceWindowManager` 的 Workspace 定向唤醒和窗口重开恢复。
- 数据：新增向后兼容的 versioned 后台 turn/通知状态；所有记录按 Workspace、父 Session 和 spawned Session identity 归属，禁止跨 scope 查询或投递。
- 测试与文档：补充 Main、MCP、IPC/preload、renderer store 和 lifecycle 的定向测试，并同步 Main/Renderer 架构 guideline 中新增的持久化 outbox 与父 Chat 调度边界。
- 不引入新的运行时依赖，不改变 Phase 1 同步调用的默认行为。
