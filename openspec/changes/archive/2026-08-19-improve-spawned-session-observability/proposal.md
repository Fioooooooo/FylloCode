## Why

spawned Session 目前仍以 assistant message 中的 `spawn.session` Signal 和 composer 内仅在运行期出现的入口为主要发现方式：Signal 在续聊时不会重复出现，任务结束后 composer 入口消失，用户难以稳定查看同一父 Chat Session 下的多个子 Agent 及其多轮历史。现有 inspection list/detail 与 view wake 已提供权威 Main 数据，但查询会在每次 wake 时读取全部 Session messages，若提升为常驻 UI 会放大磁盘读取与无效详情刷新。

## What Changes

- 在 Chat Prompt 外部、Chat 内容卡片底部新增紧凑的后台活动栏；仅在当前非 draft 父 Session 存在 spawned Sessions 时显示，汇总当前 owner 下的 Session 总数与 active 数量，并提供 active 优先、最近更新优先的会话列表入口。
- 让后台活动栏直接消费 Main owner-scoped spawned Session list/detail 与 level-triggered view wake；`spawn.session` 继续作为历史 assistant message 中的兼容性详情深链，但不再是 Session 发现、状态更新或可观察性的必要条件。
- 同一 spawned Session 续聊时保持同一列表 identity，并由最新 durable/live turn 驱动 `idle -> starting -> running -> terminal` 状态变化；同步与后台 turn 均可在 Session 列表中观察。
- 将 spawned Session Slideover 从全 Session 聚合视图改为 Turn-aware 视图：默认选择最新 Turn，可切换历史 Turn；每轮继续复用现有 Prompt、聚合 Activity、压缩 Transcript、状态与 opaque responseId 形态，不展开为完整聊天复刻。
- 将 list 路径改为轻量 summary，避免读取完整 messages；完整结构化 messages 仅在详情打开时查询。Slideover 关闭后停止详情实时刷新，保留可复用缓存。
- 强化 view wake 合并：请求进行中收到同 scope wake 时排队一次后续刷新；列表状态与打开详情采用不同刷新责任，避免高频 activity wake 反复重读全部历史，同时确保 starting、running 与 terminal 状态不会因 in-flight 合并而丢失。
- 保持 inspection 只读，不新增 UI cancel/continue，不改变 completion notification claim/dispatch、EventRail、attention、ACP runtime、容量、watchdog、父删除或 shutdown 语义。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `spawned-session-inspection`: 将仅聚合 active background turns 的 composer 入口改为父 Chat Session 级常驻后台活动栏；增加逐 Turn Slideover、轻量列表、仅打开时详情刷新与 queued wake 语义，并保持压缩 Transcript 和 notification 隔离。
- `fyllo-signal-prompt-contract`: 将新建 spawned Session 后必须输出一次 `spawn.session` 的指导改为可选深链；Signal 不再承担发现或运行状态可见性。
- `fyllo-spawn`: 调整 `prompt_to_agent` Agent-facing guidance，移除“立即输出 Signal 才能观测”的要求，明确 Main-owned inspection UI 独立于 Agent 是否输出 Signal，同时保持异步优先、轮询和结果读取契约。

## Impact

- Main/storage：`src/main/infra/storage/spawned-session-store.ts`、`src/main/services/session/spawn/spawned-session-query-service.ts` 与 `spawned-session-manager.ts` 的轻量 summary、Turn 投影和 wake 调度边界。
- 跨进程契约：`src/shared/ipc/session/spawned-session.schemas.ts` 及既有 Main IPC、preload、renderer API 的 list/detail 返回形状；继续使用 `session:spawned-session` owner-scoped 只读通道，不新增 MCP event 文件通道。
- Renderer：`src/renderer/src/stores/session/spawned-session.ts` 的 queued refresh/open detail subscription，`features/spawned-session-inspector/**` 的活动栏与 Turn-aware Slideover，以及 `ChatContainer.vue`/`ChatPromptPanel.vue` 的宿主位置调整。
- Agent prompt：`src/shared/fyllo-signal/registry.ts` 与 `src/mcp-servers/fyllo-spawn/src/tools/prompt-to-agent.ts` 的 Signal 使用指导。
- 测试：Main query/wake、shared schema、preload API、renderer store、bootstrap、Chat host、活动栏、行内 Signal 与 Slideover Turn 投影覆盖。
- Guideline：更新 `guidelines/MainProcess.md`、`guidelines/RendererProcess.md` 与 `guidelines/RendererFeatures.md`，记录轻量 inspection query、详情订阅生命周期及 Chat 宿主装配边界；不新增生产依赖。
