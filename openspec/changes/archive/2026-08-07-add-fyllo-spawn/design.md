## Context

早期 `references/designs/fyllo-spawn/01_fyllo-spawn-design.md` 在 legacy Project storage 与 bundled MCP stdio 架构下形成。当前仓库已经完成 Workspace v2、多根 `SessionWorkspaceSnapshot`、应用级 bundled MCP HTTP host、per-activation capability、ACP process pool、统一 `AcpSession`、消息组装和集中 shutdown，因此本变更必须复用这些既有边界，而不是按旧设计复制一套 Project、ACP 或进程生命周期。

当前 bundled MCP HTTP backend 由 `src/main/infra/mcp/bundled-mcp-host.ts` 统一启动，Main proxy 校验 capability、剥离 caller `X-Fyllo-*` headers，并把可信 `McpWorkspaceDescriptorV2` 注入请求级 `AsyncLocalStorage`。fyllo-spawn 需要在同一 backend child 与 Main 之间增加请求/响应 RPC，才能调用只存在于 Main 的 ACP session 能力。

## Goals / Non-Goals

**Goals:**

- 让 fyllocode Chat 的主 Agent 把任务同步委派给任意已安装 ACP Agent，并在同一 spawned Session 上续聊。
- 让调用方身份、multi-root 授权、存储 namespace 与父 Chat Session 保持一致且不可由 Agent 伪造。
- 复用现有 ACP process/session/config/event、Workspace、storage、registry 与 shutdown 逻辑，只新增 spawn-specific adapter 和状态。
- 支持多个 spawned Session 并行，同时限制瞬时并发而不限制累计 Session 数量或长期运行时间。
- 让小响应直接可用，大响应通过 owner-safe 的 `read_response` 分段读取。

**Non-Goals:**

- Phase 1 不提供 background 参数、完成通知、fyllo-signal 或 renderer spawned Session UI。
- Phase 1 不向子 Agent注入 FylloCode system reminder 或任何 bundled MCP server。
- Phase 1 不创建独立 worktree、文件锁或自动合并；并行写任务共享父 Session授权的工作目录。
- Phase 1 不在应用重启或 AgentProcess 世代变化后恢复 ACP Session，只保留可读历史。
- Phase 1 不实现精细化 permission UI，沿用当前 ACP connection 的 `allow_once` 策略。

## Decisions

### 1. 以复用矩阵约束实现边界

实现 SHALL 直接复用以下现有模块：

- `src/mcp-servers/shared/workspace-context.ts#getWorkspaceContext` 读取可信请求上下文。
- `src/main/services/session/chat/session-workspace-service.ts#assertSessionWorkspaceSnapshotCurrent` 与 `agent-workspace-compatibility.ts#assertAgentWorkspaceCompatibility` 校验 multi-root scope。
- `src/main/infra/process/acp-process-pool.ts#getOrStartProcess` 复用按 agentId 管理的唯一 AgentProcess。
- `src/main/services/session/chat/acp-session.ts#AcpSession`、`acp-session-activation.ts#activateAcpSession` 和现有 config recovery/set-option 路径创建、续用、取消 ACP Session。
- `src/main/services/session/chat/acp-mapper.ts` 与 `src/main/domain/session/chat/message-assembler.ts#MessageAssembler` 映射 ACP notifications 和组装 assistant message。
- `src/main/services/session/chat/session-registry.ts` 管理 in-flight turn 的取消和 shutdown，不新增第二套 in-flight session registry。
- `src/main/infra/mcp/bundled-mcp-host.ts` 管理 fyllo-spawn child、重启与 IPC channel，不新增第二套 MCP host。
- `src/main/bootstrap/shutdown.ts#SHUTDOWN_PHASES` 管理 quiesce/terminate/force 顺序。
- `src/main/infra/storage/workspace-paths.ts#sessionDir` 与 `atomic-write.ts` 建立 Workspace-owned spawned 路径和原子 meta 写入。

`AcpSession` 增加显式 `spawn` runtime owner/profile。该 profile 使用父 snapshot 的 `cwd`/`additionalDirectories`，返回空 `mcpServers`、空 activation 和空 reminder；不得用 `owner: "chat" + sessionMode: "native"` 冒充 spawn 语义。

将 `driveAcpStream` 中与 renderer 无关的 SessionEvent → MessageAssembler → terminal hooks 主干抽为通用 `driveAcpTurn`。现有 `driveAcpStream` 继续作为 renderer `StreamOutput` adapter，SpawnedSessionManager 使用另一组 hooks 持久化消息和更新 activity；不得复制 ACP event switch。

### 2. 为 bundled registry 增加 server 级 transport policy

`BundledMcpServerRegistration` 增加：

```ts
type BundledMcpTransportPolicy = "http-or-stdio" | "http-only";
```

fyllo-specs 与 fyllo-cortex 使用默认 `http-or-stdio`；fyllo-spawn 声明 `http-only`。`createBundledMcpActivation()` 对每个 server 独立选择：

- Agent 支持 HTTP 且 backend ready：生成 HTTP spec 并加入 grant allowlist。
- policy 为 `http-or-stdio` 且不能使用 HTTP：生成现有 stdio spec。
- policy 为 `http-only` 且不能使用 HTTP：从该 activation 省略，不生成 stdio spec。

因此 fyllo-spawn backend 恢复不会把 tool 热添加到已创建 ACP Session；只有后续新 activation 能获得它，这是 Phase 1 接受的限制。

### 3. 复用可信 Workspace descriptor 作为父身份

fyllo-spawn tool 参数不包含 `workspaceId` 或 `parentSessionId`。HTTP handler 调用 `getWorkspaceContext()`，只从 Main proxy 注入的 descriptor 取得：

```ts
interface SpawnCaller {
  workspaceId: string;
  parentSessionId: string; // descriptor.sessionId
}
```

缺少 descriptor sessionId 时返回 `SPAWN_PARENT_SESSION_REQUIRED`。Main RPC handler 收到 caller 后重新加载该 Workspace 的父 Chat Session meta，验证 Session 存在、snapshot 当前有效，并使用父 meta 的 `SessionWorkspaceSnapshot`；不得相信 child 回传的 path 或 app-data directory。

SpawnedSessionManager 的所有入口都以 caller 加 spawnedSessionId 查找。跨 Workspace/父 Session 请求统一投影为 `not_found`，不泄露目标是否存在。

### 4. 在现有 child IPC channel 上增加 typed RPC

RPC contract 放在 `src/shared/types/fyllo-spawn-rpc.ts`，包含严格可判别 union：

```ts
type FylloSpawnRpcMessage =
  | {
      protocol: "fyllo-spawn-rpc";
      version: 1;
      kind: "request";
      requestId: string;
      method: SpawnMethod;
      caller: SpawnCaller;
      params: unknown;
    }
  | { protocol: "fyllo-spawn-rpc"; version: 1; kind: "cancel"; requestId: string }
  | {
      protocol: "fyllo-spawn-rpc";
      version: 1;
      kind: "response";
      requestId: string;
      ok: true;
      result: unknown;
    }
  | {
      protocol: "fyllo-spawn-rpc";
      version: 1;
      kind: "response";
      requestId: string;
      ok: false;
      error: SpawnRpcError;
    };
```

fyllo-spawn child 用 `randomUUID()` 生成 requestId，并维护 pending promise map。MCP request abort 时发送 cancel；child disconnect/exit 时双方拒绝全部 pending 请求。Main 为每个 request 建立 `AbortController`，验证 envelope、拒绝重复 requestId，并只向产生请求的同一 managed child generation 回传 response。

`bundled-mcp-host` 只暴露 `registerBundledMcpRpcHandler(serverName, handler)` transport port，不 import services。`src/main/services/session/spawn/spawn-rpc-bridge.ts` 在 `bootstrap/runtime.ts` 显式注册/注销 SpawnedSessionManager handler，保持 `services -> infra` 依赖方向并避免 import side effect。

### 5. Tool API 使用结构化结果

`available_agents()` 复用现有 agent catalog 与 installed records，只返回已安装 registry/custom Agent 的 id、name、description，不为列表查询启动 Agent，也不返回 config。Phase 1 允许列表包含与调用方同类型的 Agent；子 Agent不获得 fyllo-spawn，因此不会递归派生。

`prompt_to_agent(agentId, prompt, sessionId?, config?)`：

- sessionId 缺失时生成 spawnedSessionId，校验父 snapshot 与目标 Agent multi-root 兼容性，创建 ACP Session。
- sessionId 存在时先校验 caller owner，再确认对应 ACP Session 仍属于当前 ready AgentProcess 世代。
- `newSession().configOptions` 是首次 config 的主要来源；先规范化并验证 config override，再逐项调用现有 set-option RPC。异步 config update 只刷新后续快照。
- 可预期的 busy、capacity、timeout、expired 使用结构化 status/code；非法输入、未安装 Agent或内部失败使用结构化 RPC error。
- 首次完成结果包含精简 config；config set 失败不阻止 prompt，但在 `warnings` 中逐项返回。

`check_session_status(sessionId)` 返回 `not_found | running | idle | error | expired`。running 包含最多 3 条 recentActivity、startedAt 和 lastActivityAt；idle 包含 latest responseId；error 包含稳定 code/message；expired 表示磁盘记录存在但当前 AgentProcess 世代不再拥有 ACP Session。

`read_response(sessionId, responseId, cursor?, maxBytes?)` 读取不可变 turn response。cursor 为 server 生成的 base64url opaque offset，调用方不能指定 path；每次读取重新校验 owner、responseId 与范围。

### 6. Spawned Session 与 turn 状态

`src/main/services/session/spawn/spawned-session-manager.ts` 维护 owner-qualified live entries。每个 entry 只允许一个 active turn；在第一个 await 前原子设置 turn state，新的同 Session prompt 返回 `busy`，不排队。

容量计数只限制同时 active turns：

- 单父 Session最多 4 个。
- 全应用最多 8 个。
- 达到上限返回 retryable `SPAWN_CAPACITY_EXCEEDED`，不占用队列。
- 不限制累计创建数量和运行时长。

已 idle 的完整 entry 可按每父 Session 32 个 resident entries 的软目标做 LRU 卸载。后续续聊从磁盘 meta 读取 owner/agent/acpSessionId，并只用 `getReadyProcess()` + `hasActiveAcpSession()` 恢复；不得调用会启动新进程的 `getOrStartProcess()`。无法恢复时返回 expired，历史仍可读。

### 7. Inactivity watchdog 使用 ACP activity 而非绝对时长

每个 active turn 建立可注入 clock/timer 的 10 分钟 watchdog。匹配 ACP Session 的 text、reasoning、tool start/update、usage 等有效进展事件刷新 lastActivityAt 并重置 timer。

超时后：

1. 状态进入 cancelling，调用 `AcpSession.cancel()`，最终复用 `connection.cancel({ sessionId })`。
2. 等待 5 秒 cancel grace。
3. prompt 在 grace 内结算时，以 `TURN_INACTIVITY_TIMEOUT` 结束并释放 active counters。
4. grace 后仍未结算时返回 `TURN_CANCEL_UNCONFIRMED`，Session 标记为不可续用 error；旧 turn 迟到事件被 fence 丢弃，不能启动下一轮。

watchdog timer 必须 `unref()`，并在正常 done/error、caller cancel、父 Session删除、process invalidation 和 shutdown 中清理。

### 8. 持久化复用 Workspace Session 子目录

路径位于：

```text
workspaceDataDir(workspaceId)/sessions/<parentSessionId>/spawn/<spawnedSessionId>/
├── meta.json
├── messages.jsonl
└── responses/
    └── <responseId>.md
```

`SpawnedSessionMeta` 使用 versioned schema，至少包含 owner、agentId、acpSessionId、固定 Workspace snapshot、状态、config 摘要、turnCount、tokenUsage、latestResponseId、error、createdAt/updatedAt。meta 写入使用 atomic replace，并按 spawned Session 串行；JSONL append 与 response write 都经过 deletion fence。

每轮先 append 主 Agent发给子 Agent 的 `role=user` UIMessage，再由通用 turn driver append assistant UIMessage。response 文件从 assistant message 按顺序提取文本和 tool title，移除 reasoning；文件以 responseId/turnId 命名且创建后不可覆盖。

`prompt_to_agent` 直接返回最多 `MAX_INLINE_RESPONSE_BYTES = 24 KiB` 的 UTF-8 安全前缀。`read_response` 默认每次 24 KiB、最高 64 KiB；完整 response 继续保留在磁盘，不因 inline/chunk 上限截断。

### 9. 删除、故障和应用生命周期

父 Chat Session删除前，session service 建立 parent deletion fence，拒绝新 spawn 和后续写入，通过扩展后的 session registry 取消全部关联 turns，最多等待 5 秒后继续删除整个 `sessionDir(workspaceId, parentSessionId)`。即使 ACP cancel 未确认，迟到事件也只能丢弃，不能重建目录。

Agent child 任意退出、升级、卸载或 process generation 变化时，process pool 必须立即发出 generation-invalidated 事件；SpawnedSessionManager 将该 agentId 的 live entries 标记 expired/error并结算 active counters。自动重启的新 AgentProcess 不继承旧 ACP Session。

shutdown quiesce 阶段先 fence 新 spawn、取消 watchdog 和 active turns；现有 session registry 与 spawned manager 在 ACP process pool terminate 前结算。bundled MCP host 继续在 terminate phase 关闭 fyllo-spawn backend，全部资源共享现有 4 秒总 deadline。

## Risks / Trade-offs

- [多个写能力 Agent共享工作目录可能冲突] → tool description 明确要求主 Agent拆分不重叠文件范围；Phase 1 不引入 worktree 或文件锁。
- [`allow_once` 自动授权扩大委派任务能力] → 作为 Phase 1 明确策略记录；精细 permission routing 延后，不伪装为已解决。
- [HTTP-only 导致部分 Agent看不到 fyllo-spawn] → 按 registry policy 省略 server，保留其他 bundled MCP 的 stdio fallback。
- [不注入治理 reminder 使子 Agent不了解 FylloCode Chat/Proposal 流程] → 主 Agent负责委派边界；Phase 1 子 Agent不获得 fyllo-action 或递归 spawn 能力。
- [完整历史长期占用磁盘] → 跟随父 Session生命周期统一删除；不设置会阻断长期运行的累计 Session硬上限。
- [应用或 AgentProcess 重启后不能续聊] → 返回 expired/not_found，保留消息与 response 供排查和读取，不做不可靠的跨世代恢复。

## Migration Plan

本变更只新增 versioned spawned data 子目录，不读取或改写历史 Session格式，因此不需要数据 migration。发布时先扩展 registry/build/host RPC，再接入 service/store/tools；回滚时移除 fyllo-spawn registry 项与 runtime bridge即可，遗留 `spawn/` 历史目录保持无害并随父 Session删除。

## Open Questions

无。background、signal、renderer UI、精细 permission 与子 Agent上下文注入均明确留给后续独立变更。
