## Context

当前仓库的 IPC 暴露面存在三类问题：

1. `shared/types/channels.ts`、`electron/main/ipc/*`、`electron/preload/api/*`、`frontend/src/api/*` 中保留了多组零调用或空壳 channel，例如 `chat:getSession`、`chat:sendMessage`、`net:*`、部分 legacy `integration:*` 通道，以及当前未接入 UI 的 `window:*` 通道。
2. `window.electron` 仍通过 `contextBridge.exposeInMainWorld("electron", electronAPI)` 暴露给 renderer，即使当前业务代码没有真实消费它。该 bridge 允许未来代码绕过 `window.api` 的业务域边界，直接依赖底层 Electron preload 能力。
3. `guidelines/IPC.md`、`guidelines/Architecture.md`、`guidelines/RendererProcess.md` 与现状和用户确认的收口方向不一致，仍描述已删除或不再推荐的接口。

这次变更不是单纯的“删实现”，而是一次 IPC 契约面收紧：Apply 阶段需要同时删除代码路径、更新类型声明、收口测试依赖、并修改 spec / guideline 中已不再成立的承诺。

## Goals / Non-Goals

**Goals:**

- 删除已确认无调用、无当前产品价值、且不再承担过渡职责的 IPC channel 和对应 preload / renderer API。
- 移除 `window.electron` 暴露，只保留 `window.api` 作为 renderer 访问主进程能力的唯一公开入口。
- 让 `shared/types/channels.ts`、main/preload/renderer API、OpenSpec spec、guidelines 文档重新对齐。
- 保证 Apply 阶段清理后，仓库中不存在对已删除 channel 或 `window.electron` 的残留引用。

**Non-Goals:**

- 不为 settings preferences 补做真正的持久化实现；后续若恢复该能力，应按真实需求重新建 IPC。
- 不重构现有仍在使用的 chat / proposal / acp / provider-oriented integration IPC 设计。
- 不在本变更中引入新的 renderer 能力替代 `window:*` 或 `net:*`；若未来产品重新需要，应按具体场景重新设计业务域 API。

## Decisions

### 1. 按“公开契约最小化”原则删除整条调用链

对每个确认删除的 channel，Apply 阶段不是只删 `shared/types/channels.ts` 常量，而是整条链路一起删除：

- `shared/types/channels.ts` 中的 channel 常量
- `shared/schemas/ipc/<domain>.ts` 中仅服务于该 channel 的 schema
- `electron/main/ipc/<domain>.ts` 中的 handler
- `electron/preload/api/<domain>.ts` 中的方法
- `frontend/src/api/<domain>.ts` 中的包装方法
- `electron/preload/index.ts` / `index.d.ts` 中不再需要的暴露和类型
- 相关测试 mock、文档与 spec 描述

理由：只删除某一层会继续制造漂移，使“是否还能调用”在不同层给出矛盾信号。

备选方案：仅在 `frontend/src/api/*` 隐藏未使用方法，保留 main/preload/channel 常量。  
放弃原因：这会保留死契约，对后续开发者仍然构成误导。

### 2. 删除 `window.electron`，统一 renderer 只依赖 `window.api`

Apply 阶段应移除：

- `electron/preload/index.ts` 中 `contextBridge.exposeInMainWorld("electron", electronAPI)` 及非隔离分支里的 `window.electron = electronAPI`
- `electron/preload/index.d.ts` 中 `window.electron: ElectronAPI`
- 与之相关的文档描述与测试说明

理由：

- 当前 renderer 业务代码无真实依赖。
- 所有现有主进程能力都已通过 `window.api` 封装。
- 暴露底层 bridge 会削弱“页面 / 组件 / store 不得碰原生 IPC”的约束，使未来代码可以绕开 `frontend/src/api/*` 和 preload 业务封装。

备选方案：保留 `window.electron`，仅通过 lint / code review 约束不要使用。  
放弃原因：约束弱于接口面最小化，且当前没有必须依赖该 bridge 的业务。

### 3. 删除 legacy integration tool-centric 通道，而不是继续以“过渡”名义保留

纳入清理范围的 legacy integration 通道包括：

- `integration:listTools`
- `integration:getConnection`
- `integration:listProjectConfigs`
- `integration:setProjectConfig`
- `integration:yunxiao:setToken`
- `integration:yunxiao:setOrganization`

这些入口曾用于旧页面或过渡方案，但用户已确认旧页面已经移除，不再需要为过渡保留。保留它们会让 integration 域同时存在 provider-oriented 与 tool-centric 两套模型，增加语义噪音。

保留的 integration 通道应仅限当前真实能力：

- `integration:getConnections`
- `integration:connect`
- `integration:disconnect`
- `integrations:providers:*`
- `integrations:project:*`

### 4. 将 `window:*` 和 `net:*` 视为“无当前需求的能力入口”，不做保守保留

`window:*` 与 `net:*` 的逻辑都很简单，但“简单”不构成保留理由。

- `net:*` 只是通用跨域代理，没有 active spec 约束，也没有业务调用；未来若需要网络代理，应按具体业务域重新建受约束的 API，而不是恢复通用 fetch 后门。
- `window:*` 当前没有 UI 消费；未来若重新做自定义标题栏按钮，应基于那次真实需求重新引入，并同时补齐 spec。

这意味着 Apply 阶段应直接删除 `electron/main/ipc/net.ts` 和 `electron/preload/api/net.ts`；若 `window:*` 全部移除后 `electron/main/ipc/window.ts` / `electron/preload/api/window.ts` 变为空文件，也应一并删除并更新总注册入口。

## Risks / Trade-offs

- [Risk] 删除 `window.electron` 后，某些测试或隐藏代码路径可能仍通过全局 bridge 取值。  
  → Mitigation: 在 Apply 阶段先全仓 grep `window.electron` / `ElectronAPI`，清理 mock、类型声明和文档说明后再移除 preload 暴露。

- [Risk] 清理 legacy integration 通道后，历史文档、旧测试或未发现的 store 代码可能仍引用 tool-centric 语义。  
  → Mitigation: 以 channel 名和 API 方法名做全仓检索；删除代码前先确认当前 renderer 只依赖 provider-oriented / `getConnections` 流程。

- [Risk] `window:*` 删除后，如果近期马上要做自定义标题栏按钮，需要重新新增 IPC。  
  → Mitigation: 本次明确把“无当前需求时不保留占位能力”作为设计决策；未来若需求出现，按真实交互重新走 proposal。

- [Risk] OpenSpec `ipc-protocol` / `ipc-request-response` 过于泛化，修改时容易误删仍有效的通用约束。  
  → Mitigation: 仅修改与本次删除项直接相关的 requirement 文案和示例，保留请求响应、schema 校验、流式协议等未受影响约束。
