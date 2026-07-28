## Context

ACP SDK `InitializeResponse` 将 `authMethods` 放在响应顶层，将 `promptCapabilities`、`mcpCapabilities` 与 `sessionCapabilities` 放在 `agentCapabilities` 内。当前 `agent-capability-store.ts` 仅把 prompt 能力归一化为三个必填布尔值并写入版本 1 缓存；`acp-agents.ts` 的 `loadCapabilitiesCache` handler 又把缓存 entry 投影为 prompt-only map。renderer 因此无法在冷启动或未来个性化适配中访问其余初始化能力。

本变更跨越 main infra/process、platform service/IPC、shared/preload contract 和 renderer store，并改变 `agent-capabilities.json` 的持久化 schema。缓存属于可重建数据；Agent initialize 与 renderer 当前 prompt 体验不得因缓存读写失败而不可用。

## Goals / Non-Goals

**Goals:**

- 按 Agent 持久化 SDK 原始 `authMethods`、`promptCapabilities`、`mcpCapabilities` 与 `sessionCapabilities`，保留 `_meta` 和未来扩展字段。
- 让 `loadCapabilitiesCache` 与 `ensureAgent` 向 renderer 返回同一完整能力快照，不再在 main IPC 裁剪。
- renderer 保存完整快照，并保持现有 prompt capability 默认值、刷新方式和附件能力判断不变。
- 兼容读取 v1 prompt-only 缓存，并在后续 initialize 或缓存 mutation 时自然升级到 v2。
- 保持多 Agent 并发 initialize 时的 read-modify-write 更新不丢失其他 entry。

**Non-Goals:**

- 不缓存完整 `InitializeResponse`，本次不纳入 `agentInfo`、顶层 `loadSession`、`auth`、`nes`、`positionEncoding` 或 `providers`。
- 不新增认证 UI、MCP UI、session capability UI 或 Agent 个性化展示。
- 不改变 ACP initialize 请求、认证流程、session 行为或 bundled MCP transport 选择逻辑。
- 不直接依赖 SDK 未从 package public root 导出的内部 Zod 文件。

## Decisions

### 1. 公共快照直接复用 ACP SDK 类型

在 `src/shared/types/acp-agent.ts` 定义应用级 entry/document 容器，但字段类型直接从 `@agentclientprotocol/sdk` 作 type-only import：

```ts
interface AcpAgentCapabilitySnapshot {
  authMethods?: AuthMethod[];
  promptCapabilities?: PromptCapabilities;
  mcpCapabilities?: McpCapabilities;
  sessionCapabilities?: SessionCapabilities;
  capturedAgentVersion: string;
  capturedAt: string;
}

type AcpAgentCapabilityCache = Record<string, AcpAgentCapabilitySnapshot>;
```

四个 SDK 字段保持 optional，以区分 Agent 未声明字段与声明空 marker object 的语义。`authMethods` 虽然位于 `InitializeResponse` 顶层，仍与三类 `agentCapabilities` 字段合并到同一按 Agent 索引的快照中。

选择该方案而不是维护 `CachedAuthMethod` 或布尔化 session/MCP 镜像，是为了让 SDK 新增字段与 `_meta` 自动进入 TypeScript 契约，避免手写 union 漏掉认证 variant，并保留 `{}` marker 的协议语义。当前 `AcpPromptCapabilities` 与 `normalizePromptCapabilities()` 继续作为 UI projection，而不是持久化格式。

### 2. 缓存文档升级为 version 2，但不缓存整个 InitializeResponse

`agent-capabilities.json` 继续使用现有 `{ version, agents }` envelope、原路径和原子临时文件 rename，entry 改为上述快照。`upsertPromptCapabilities` 改为表达完整采集职责的 `upsertAgentCapabilities`，接收 Agent ID、initialize response 中的四个字段及 captured Agent version，在一次 entry 替换中写入一致快照。

选择显式四字段快照而不是原样保存整个 `InitializeResponse`，是为了遵守已确认范围并避免将未使用的实验能力无意变成 renderer 公共契约。未来新增要缓存的 initialize 字段应单独扩展该版本化契约。

### 3. 运行时校验保留 SDK 扩展字段

磁盘 JSON 仍由本地 Zod schema 验证 envelope、时间/版本元数据和四个字段的稳定基础形状。所有表示 SDK 对象的 schema（包括 `_meta`、auth method 与嵌套 `vars`）必须使用 passthrough/loose 语义，不能由默认 strip 行为删除 SDK 未知字段。解析结果的公开 TypeScript 类型使用 SDK 导出的类型。

不 deep-import `dist/schema/zod.gen.js`：该文件虽随当前 SDK 发布，但不属于 package public root，升级兼容性弱。写入来源已经是 SDK 返回的 typed initialize response；本地 schema 的职责是隔离损坏磁盘文件，同时保留协议扩展，而不是复制完整 ACP 协议验证器。

### 4. v1 只读兼容与 v2 写回分离

`loadCache()` 接受 v1 与 v2：

- v2 按完整 schema 返回。
- v1 entry 转换为仅含原 `promptCapabilities`、`capturedAgentVersion` 与 `capturedAt` 的 v2 内存快照，不伪造空 `authMethods`、MCP 或 session 能力。
- 未知版本或损坏文档沿用当前容错：记录 warning 并返回空 map。

读取 v1 本身不写磁盘。应用升级后的 renderer bootstrap 可以先取得 prompt-only partial snapshot；全局 warmup、lazy start 或其他连接路径成功完成 initialize 后，`upsertAgentCapabilities` 才把当前 Agent 替换为完整快照，并将整个文档写成 v2 envelope。其他尚未重新连接的 Agent 可以在 v2 文档中继续保留 partial snapshot，直到各自 initialize 后被逐项刷新。

这是新版本对可重建旧缓存的读取兼容，不是数据迁移：不接入 migration runner，不要求升级前后一次性转换所有 Agent，也不阻塞应用启动。

### 5. 同一 store 内串行化缓存 mutation

把 upsert/remove 的 read-modify-write 放入模块级串行 mutation 队列，确保全局 warmup 并发完成多个 Agent initialize 时不会由交错读取覆盖其他 Agent entry。读取仍可直接执行；mutation 失败必须释放队列，让后续更新继续。

选择进程内队列而不是文件锁，是因为该缓存只有 Electron main 进程拥有写权限，现有架构不存在多进程 writer。

### 6. 复用现有 IPC，不增加并行 prompt-only API

`platform:acp-agents:loadCapabilitiesCache` 保持 channel 名不变，返回从 `Record<string, AcpPromptCapabilities>` 扩展为 `AcpAgentCapabilityCache`；handler 直接返回 `loadCache()` 结果，不再 `Object.fromEntries(...entry.promptCapabilities)`。

`ensureAgent()` 返回当前 Agent 的 `AcpAgentCapabilitySnapshot`。版本匹配的缓存命中直接返回 snapshot 并维持 lazy start；缓存缺失或版本不匹配时等待/复用 process pool initialize，从 `initializeResponse` 构造并返回同形快照。持久化失败仍不阻止返回 live snapshot。

选择扩展已有 API 而不是新增 full-cache API，是因为 channel 名本就表示 capabilities cache，保留 prompt-only 投影只会继续制造两个不一致的数据源。

### 7. renderer 以完整快照为源，保留现有 prompt projection

`src/renderer/src/stores/platform/acp-agents.ts` 新增按 Agent 索引的完整 snapshot state，`loadCapabilitiesCache()` 与 `refreshCapabilities()` 写入该 state。Agent unavailable 时删除对应 snapshot。

现有 `getPromptCapabilities()` 继续调用 `normalizePromptCapabilities(snapshot?.promptCapabilities)` 并返回当前必填布尔结构。若 `promptCapabilitiesByAgent` 已被测试或外部代码使用，则将其保留为从 snapshot state 派生的兼容 projection，避免当前组件、附件能力判断和默认 false 语义变化。renderer 本次不消费 auth/MCP/session 字段，但完整 state 必须通过 store public return 暴露，供后续适配使用。

## Risks / Trade-offs

- [SDK 类型升级新增运行时字段，本地 Zod 默认会 strip] → 所有 SDK 对象 schema 使用 passthrough/loose，并用包含未知字段的 `_meta` 测试验证磁盘与 IPC 往返。
- [auth method 可能携带 `terminal.env` 或 Agent 自定义 `_meta`] → 按用户确认保留完整 SDK 数据；文件继续位于现有 userData 范围，renderer 只保存而不渲染为 HTML、日志或 telemetry。
- [升级后首次读取只能得到 v1 prompt-only 数据] → 返回保留缺失语义的 partial snapshot；renderer 继续使用现有 prompt projection，连接成功后再由 v2 写回逐 Agent 补齐。
- [缓存写入失败导致磁盘与 live response 不一致] → 维持 cache best-effort 边界，`ensureAgent` 从 live initialize response 返回快照，错误只记录日志。
- [IPC 返回扩大增加少量启动 payload] → 数据只在 bootstrap load 和显式 ensure 时传输，能力对象体积小，不新增轮询。
- [旧版本应用回滚时无法解析 v2] → 旧版会按现有损坏/未知缓存行为返回空并通过 Agent initialize 重建；缓存不承载不可恢复用户数据。

## Upgrade Flow

1. 新版本启动后，renderer bootstrap 首次读取现有 v1 文件，获得 prompt-only partial snapshot；该读取不改写文件。
2. 全局 warmup 或 lazy start 成功完成某个 Agent 的 initialize 后，对应 entry 更新为完整 snapshot，并以 v2 envelope 写回；尚未连接的其他 Agent entry 可继续保持 partial。
3. renderer 下一次调用 `loadCapabilitiesCache` 时读取 v2；通过 `ensureAgent` 获得的 live/updated snapshot 也使用相同 contract。
4. 后续每个 Agent 成功建立新的 initialized connection 时，逐项刷新自己的完整 v2 entry。
5. 若回滚到旧版，旧版忽略 v2 并通过 Agent initialize 重建自身支持的 prompt-only cache；缓存不承载不可恢复用户数据。

## Open Questions

无。字段范围、SDK 类型复用、`_meta` 保留、完整 renderer 传输与现有 UI 兼容策略均已确认。
