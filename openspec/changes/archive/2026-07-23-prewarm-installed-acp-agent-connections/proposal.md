## Why

ACP Agent 的安装记录、custom 配置、进程连接池和生命周期都是应用级全局资源，但当前只有 renderer 为默认 Agent 创建 draft probe 时才会启动对应进程，其他 Agent 在用户跨项目切换前仍可能承受完整冷启动延迟。系统需要由 main 进程在应用 ready 后主动预热所有全局已安装 Agent，并补齐升级、卸载和 custom 配置变更时的单 Agent 进程失效与停止能力。

## What Changes

- Main 进程在 `app.whenReady()` 对应的 `bootstrapReady()` 完成 shell PATH 同步、migration、IPC/event 注册和首窗创建后，通过 `setImmediate` 在下一轮 event loop 后台发现并预热所有全局已安装 registry Agent 与 custom Agent；该工作不等待 `did-finish-load`，也不得阻塞首窗展示或 app ready 完成。
- 在 main 进程集中调度连接预热，以有限并发调用现有 ACP process pool 的 `getOrStartProcess(agentId)`，复用 warmup、probe、chat 和多窗口并发请求的单进程启动。
- Agent 首次安装成功、升级成功或 custom 配置保存成功后，由 main service 直接提交新增或仍有效 Agent 的增量预热；预热不再依赖 renderer 状态、项目窗口或新增 IPC。
- 保留当前默认 Agent 的 draft probe：连接预热只完成进程启动和 ACP `initialize`；`configOptions`、`availableCommands` 等 session 信息仍由用户当前选择对应的 `probeEnsure` / `newSession` 获取。
- 增加按 `agentId` 主动停止 ACP 进程的生命周期能力；Agent 卸载、升级以及影响启动配置的 custom Agent 变更必须先停止旧进程并取消该 Agent 的待启动或待重启工作。
- Agent 升级后继续对话时保持既有 ACP session 恢复语义，继续由现有 resume、load 和 fresh fallback 流程处理，不新增迁移格式或替代恢复算法。
- 预热和单 Agent 启动失败按 Agent 隔离并记录，不阻塞其他 Agent、main bootstrap、窗口创建或当前可用 Agent；应用退出时必须先取消 warmup 队列和尚未执行的首次预热调度，并禁止 process pool 接受新的启动。

## Capabilities

### New Capabilities

- `acp-agent-connection-lifecycle`: 定义应用级已安装 ACP Agent 的 main-owned 后台连接预热、连接复用、主动停止、配置失效以及升级后会话恢复边界。

### Modified Capabilities

无。

## Impact

- Main bootstrap：`src/main/bootstrap/index.ts` 在现有 ready 顺序末尾非阻塞启动全局 Agent 预热。
- Main platform service：`src/main/services/platform/acp-agent/acp-agent-service.ts` 与新增 warmup coordinator 负责全局 Agent 发现、首次/增量预热及安装、升级、卸载、custom 配置保存后的连接生命周期。
- Main infra：`src/main/infra/process/acp-process-pool.ts` 提供单 Agent stop、starting/restarting 取消、连接失效事件和应用退出统一 dispose。
- Session：复用 `src/main/services/session/chat/session-probe-service.ts` 和 `acp-session.ts` 的既有连接获取与恢复流程，不改变持久化 schema。
- Renderer、preload 与 shared IPC：不新增连接预热 API；现有 Agent 状态展示、默认 Agent 选择和 draft probe 行为保持不变。
- 测试：补充 main bootstrap、platform ACP Agent warmup/service、process pool 生命周期、probe invalidation 及升级后恢复边界测试。
