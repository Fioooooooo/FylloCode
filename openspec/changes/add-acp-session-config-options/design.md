## Context

ACP 协议（`@agentclientprotocol/sdk`）在 1.x 引入 `SessionConfigOption` 概念，覆盖 mode / model / thought_level 等 session 级开关：

- 三种 session 入口的响应都带 `configOptions?: Array<SessionConfigOption> | null`：`NewSessionResponse`、`ResumeSessionResponse`、`LoadSessionResponse`，未来 `ForkSessionResponse` 同形（schema 已有，本期不接入）。
- `sessionUpdate: "config_option_update"` 推送 `ConfigOptionUpdate { configOptions: SessionConfigOption[] }`，**也是全集**，与请求响应语义一致。
- 客户端通过 `connection.setSessionConfigOption({ sessionId, configId, value, type? })` 修改单项；返回 `SetSessionConfigOptionResponse { configOptions }`，**仍是全集**。
- `category` 是 `"mode" | "model" | "thought_level" | string`（开放枚举），客户端 MUST 处理未知 category，不能假设是闭集。
- `SessionConfigSelect.options` 是 `Array<SessionConfigSelectOption> | Array<SessionConfigSelectGroup>`，即支持平铺与分组两种形态。
- `agentCapabilities` 中**没有** "supportsConfigOptions" 标志位。客户端只能通过实际响应里 `configOptions` 是否为空数组/`null` 来判断。

FylloCode 现有 ACP 主进程链路（参考 `openspec/specs/acp-chat-backend/spec.md`）：

- `AcpSession` 已有 turn 级生命周期、capability gating、reminder 注入、recovery 机制；`recoverSession` 内部分别在 `resumeSession` / `loadSession` / `newSession` 三个分支拿到响应，但目前只读取 `created.sessionId`，丢弃 `configOptions`。
- `tryHandlePersistedSession` 走的是 direct prompt 分支，没有 session 创建/恢复响应，其 `configOptions` 必须依赖 turn 内 server-push 才能拿到。
- `acp-mapper.ts` 已经按 `sessionUpdate` 类型 switch，default 分支只打 debug 日志，新增 case 无侵入。
- `session-event-mapper.ts` 把 `SessionEvent` 转 `MessageChunkData`，新增 `config_options_update` 项即可。
- `chat:stream:message` 的 stream-channel 已经在做 chunk 转发；`chat:setConfigOption` 是单次请求，不应走 stream，复用 `wrapHandler` + `validate` 即可。
- `SessionMeta` 持久化在 `electron/main/infra/storage/session-store.ts`，已有 `available_commands?: AcpAvailableCommand[]` 字段作为先例。

Renderer 现状：

- `ChatPromptPanel.vue` footer 左侧已经有 `ChatAgentSelect`，本次 Bar 紧随其后。
- `useUIMessageAssembler` 不处理 `config_options_update`，类似 `available_commands_update` 走旁路：直接进 store action 不进 message 组装。
- `useChatStore.streamSessionMessage.onChunk` 已用 `switch (data.kind)` exhaustive 处理；新增 case 必须保持 exhaustive（`default: { void data; throw new Error(...) }`）。
- `Session` 的 `availableCommands?` 已建立先例：磁盘 key 是 `available_commands`，内存类型字段是驼峰 `availableCommands`。本期遵循同样的规则：磁盘 `config_options`，内存 `configOptions`。

## Goals / Non-Goals

**Goals:**

- 让 main → renderer 流的"全集替换"是唯一通路：三个 session 入口响应 / server-push / set 响应全部经过相同的事件→chunk 路径。
- IPC `chat:setConfigOption` 的成功响应同样带回 `configOptions`，但**不**复用 chunk（避免在无 turn 时 stream 已关闭的边界），由 renderer store 用响应值更新内存态。
- 草稿态（`session.acpSessionId` 不存在）渲染策略明确为"整个 Bar 不渲染"，无 placeholder、无 loading 占位。
- 未知 `category` 在 UI 上有 fallback 渲染，不丢失或乱排。
- 失败路径明确：`CONFIG_OPTION_NOT_SUPPORTED` 与 `CONFIG_OPTION_INVALID_VALUE` 是两类业务错误，与 `ACP_NOT_READY` / `ACP_ERROR` 区分开。

**Non-Goals:**

- 不预探测（probe）schema：草稿态绝不发起 `connection.newSession` 仅为拿 configOptions。
- 不为 `agentId` 持久化跨 session 的 schema 缓存。configOptions 是 per-session 行为，不能跨 session 复用。
- 不扩展 ACP 协议、不实现 forkSession。
- 不实现 reconcile 逻辑（草稿态用户预设 → newSession 后逐项 setConfigOption 同步）。本期草稿态没有 Bar，自然不需要。
- 不为 `boolean` type 设计独立的视觉与交互（同样走 USwitch，无图标特殊化）。
- 不调整 `ChatAgentSelect` 在 footer 中的位置。

## Decisions

### Decision 1: 全集替换语义统一为单一通路

**选择**：所有"configOptions 全集"的来源都通过 `SessionEvent { type: "config_options_update", options }` 流到 renderer store；renderer store 用整个数组替换 `Session.configOptions`，不做 patch。

**替代方案**：

- A. 客户端维护 patch 算法（按 `id` 匹配，更新 currentValue）。**否决**：ACP 协议直接给的就是全集，自行 patch 反而引入对齐风险。
- B. 三个入口分别走不同路径（构建响应进 IPC 返回值、server-push 进 chunk、set 响应进 chunk）。**否决**：set 响应在 turn 外可能调用（agent 进程在线但无活跃 prompt），此时 stream port 已关闭，chunk 无处可发。

**结果**：三种 session 创建/恢复响应、`config_option_update` server-push 走 chunk；`setSessionConfigOption` 客户端响应走 IPC 返回值。两条通路**最终落到 renderer 的同一个 store action `setSessionConfigOptions`**，从而保证全集替换语义不分叉。

### Decision 2: 不在 stream chunk 之外发送主动 emit

**选择**：`config-option-service.setConfigOption` 通过 `connection.setSessionConfigOption` 拿到响应后，**仅**作为 IPC 返回值返回；**不**调用 `AcpSession.emit("event", ...)`。

**替代方案**：

- 在 `sessionRegistry` 找到 `AcpSession` 后 emit chunk → 用户在 turn 进行中改 mode 也能自动反映在 UI。**否决**：renderer 在发起 `chat:setConfigOption` 后已经能用响应值刷新 UI，重复 emit 会让 store 收到两次相同数据。

**结果**：renderer store 在 IPC `setConfigOption` 成功回调中调用 `setSessionConfigOptions(sessionId, response.configOptions)`，与 chunk 处理使用同一个 action，行为对齐。

### Decision 3: 草稿态完全不渲染 Bar

**选择**：草稿态（`session === null` 或 `session.configOptions` 为空/缺失）→ `ConfigOptionsBar` 不渲染。

**替代方案**：

- A. 渲染骨架/placeholder 让用户提前感知有这个能力。**否决**：probe 不允许，骨架最终可能"消失"导致闪烁。
- B. 渲染禁用态 dropdown，hint "请先发送消息"。**否决**：UX 噪音，且按钮无任何可选项可展示。

**结果**：`ConfigOptionsBar` 的根节点 `v-if="hasConfigOptions"` 简单判定。从草稿态进入正式 session 后，`newSession` 响应回来 → chunk → store → Bar 出现。视觉上加一个 150ms 的淡入位移过渡。

### Decision 4: 渲染优先级与未知 category fallback

**选择**：

- 已知 `category` 排序固定为 `mode → model → thought_level`，其余按 agent 返回顺序追加；目的是让常见三大类位置稳定，不随 agent 数组顺序抖动。
- 未知 `category`（含 `null`、空字符串、`_*` 自定义类别）走通用图标 `i-lucide-sliders` + 通用 dropdown。
- 已知 category 的图标：`mode → i-lucide-shield-check`、`model → i-lucide-cpu`、`thought_level → i-lucide-brain`。

**替代方案**：

- A. 完全按 agent 返回顺序渲染。**否决**：用户切 agent 后位置漂移，违反 UX 稳定性。
- B. 按 `category` 字典序排。**否决**：违反语义优先级（model 比 thought_level 重要）。

### Decision 5: SessionMeta 持久化

**选择**：在 `SessionMeta` 新增 `config_options?: AcpSessionConfigOption[]`，与 `available_commands` 同位治理；落盘策略沿用 session-store 的字段级更新。

**理由**：

- 用户重新打开 session 时，第一次 turn 还没发起，但希望立即看到 Bar 与上次的 currentValue。
- 协议保证下次 `resumeSession` / `loadSession` 也会回传新的 configOptions（全集），所以本地缓存只是"上次快照"，下次响应到达后立即被替换，**不存在跨 session 漂移**风险。

**与"不持久化跨 agent schema"不矛盾**：本字段是 per-session 的，与 agent-level capability 缓存（`agent-capabilities.json`）是不同概念。

### Decision 6: AcpSessionConfigOption 类型脱 SDK

**选择**：在 `shared/types/acp-config.ts` 定义独立类型，主进程 `acp-mapper` 与 `config-option-service` 把 SDK `SessionConfigOption` 拍平成它，去除 `_meta`、归一 null/undefined。

```ts
export type AcpSessionConfigOptionValue = string;

export interface AcpSessionConfigOptionGroup {
  group: string;
  name: string;
  options: AcpSessionConfigOptionValueItem[];
}

export interface AcpSessionConfigOptionValueItem {
  value: AcpSessionConfigOptionValue;
  name: string;
  description?: string;
}

export type AcpSessionConfigOptionCategory = "mode" | "model" | "thought_level" | string;

interface AcpSessionConfigOptionBase {
  id: string;
  name: string;
  description?: string;
  category?: AcpSessionConfigOptionCategory;
}

export interface AcpSessionConfigSelect extends AcpSessionConfigOptionBase {
  type: "select";
  currentValue: AcpSessionConfigOptionValue;
  options: AcpSessionConfigOptionValueItem[] | AcpSessionConfigOptionGroup[];
}

export interface AcpSessionConfigBoolean extends AcpSessionConfigOptionBase {
  type: "boolean";
  currentValue: boolean;
}

export type AcpSessionConfigOption = AcpSessionConfigSelect | AcpSessionConfigBoolean;
```

**替代方案**：直接在 shared 层 `import type { SessionConfigOption } from "@agentclientprotocol/sdk"`。**否决**：preload 与 renderer 都会拉到 SDK 类型，破坏现有"shared 不依赖 main 专属包"的规则；且未来 SDK 升级 schema 会直接漏到 renderer 引发 breaking。

### Decision 7: 错误码与失败路径

| 场景                                                                 | 错误码                        | 备注                                         |
| -------------------------------------------------------------------- | ----------------------------- | -------------------------------------------- |
| renderer 调 `setConfigOption` 时该 session 无 acpSessionId（草稿态） | `VALIDATION_ERROR`            | 主进程 zod 校验阶段拒绝（acpSessionId 必填） |
| agent 不实现 `setSessionConfigOption` 方法                           | `CONFIG_OPTION_NOT_SUPPORTED` | 主进程检查 ACP 错误信号（method not found）  |
| value 不在缓存的 `options` 集合中                                    | `CONFIG_OPTION_INVALID_VALUE` | 主进程在调用前做防御性校验，避免无谓 RPC     |
| ACP 进程未就绪                                                       | `ACP_NOT_READY`               | 复用现有错误码                               |
| 其他 ACP 错误                                                        | `ACP_ERROR`                   | 复用现有错误码                               |

`CONFIG_OPTION_INVALID_VALUE` 的预校验逻辑：

- 主进程不维护独立的 schema 缓存；从 `SessionMeta.config_options` 读出该 `configId` 的 schema。
- 若 `type === "select"` 则比对 `value` 是否出现在 options 集合（兼容平铺与分组两种 shape）。
- 若 schema 缺失（极端情况：configOptions 还没回传过就调），跳过预校验，直接发起 RPC，由 agent 的错误兜底。

### Decision 8: stream chunk 与 Session.configOptions 的合并落盘

**选择**：与 `available_commands` 同构——主进程在收到 `config_options_update` event 时，**立即**通过 session-store 字段级更新 patch 到磁盘，并 forward chunk 给 renderer。

```ts
case "config_options_update": {
  const chunk = toMessageChunk(ev);
  if (chunk) sink.sendChunk(chunk);
  enqueueSessionMetaPersist(
    {
      config_options: ev.options,
      updatedAt: new Date().toISOString(),
    },
    "[chat] failed to persist session config options update"
  );
  break;
}
```

**replay 抑制**：现有 `runtimeState.suppressReplay` 已经对 `available_commands_update` 之外的 message 流抑制；`config_options_update` 是 session 级元数据更新，与 `available_commands_update` 同等待遇——**不被 replay 抑制**，loadSession 期间的回放也应让 UI 拿到最新全集。这一行为在 `acp-session-recovery#shouldSuppressDuringReplay` 里同步加白名单。

### Decision 9: setConfigOption 的乐观更新策略

**选择**：renderer 调 `setConfigOption` 时立即在 store 中乐观更新 `currentValue` 为目标值（保留旧值用于回滚），UI 的下拉触发器同时进入 spinner 态；IPC 成功 → 用响应替换全集；IPC 失败 → 回滚 currentValue + toast 错误信息。

**理由**：ACP RPC 在网络/进程间有可见延迟（百毫秒级），用户预期是"点了就改"。失败回滚由 IPC 响应驱动，不会出现"乐观值与最终值长期不一致"。

## Risks / Trade-offs

- **Risk**：用户点开 dropdown 时 `setConfigOption` RPC 慢导致体感卡顿。**Mitigation**：乐观更新 + spinner，UI 立即响应；失败时 toast 提示原因并回滚。
- **Risk**：agent 在 turn 进行中通过 `config_option_update` push 改变 currentValue（例如 model 自动降级），与用户正在操作的乐观更新值冲突。**Mitigation**：chunk 处理一律全集替换，覆盖乐观值；这是 ACP 协议本身定义的"agent 可主动修改"语义，UI 无需对抗。
- **Risk**：`SessionConfigSelect.options` 出现 `Array<SessionConfigSelectGroup>` 时下拉 UI 必须支持分组，但本期主流 agent 只用平铺。**Mitigation**：`ConfigOptionItem` 内对两种 shape 做 type guard，分组时渲染嵌套 menu group；测试至少覆盖一组分组形态。
- **Risk**：未知 `category` 在 UI 上 fallback 后，将来 ACP 增加新的官方 category（例如 `tool_set`），FylloCode 仍按通用图标渲染，看起来不专。**Mitigation**：可接受，这是开放枚举的本质代价；后续单独 PR 引入新图标即可。
- **Risk**：`config_options` 写盘频率与 `available_commands` 相当，但 schema 更大（每项含 options 数组），频繁全量替换持久化在大 agent（model 列表 ~10）下大约每次 1~2KB JSON。**Mitigation**：复用 `enqueueSessionMetaPersist` 的串行写队列，不引入新的写入热路径；不做差量。
- **Risk**：草稿态首条消息发出后，用户在等待 newSession 响应期间 Bar 还没出现，体感上"为什么发了消息后才看到选项"。**Mitigation**：本期 design 决定接受此短暂延迟；后续若引入 ChatAgentSelect 升位置 + agent 切换时的轻量 probe，再扩展为 draft 态可见，独立提案。
