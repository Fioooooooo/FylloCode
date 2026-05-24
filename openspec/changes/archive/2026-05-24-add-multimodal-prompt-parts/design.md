## Context

FylloCode 现有 chat 链路：

- `frontend/src/stores/chat.ts` 的 `sendMessage(text: string)` → `chatApi.streamMessage(sessionId, projectId, agentId, prompt: string, callbacks)`
- preload `chatApi.streamMessage` 通过 `ChatStreamChannels.streamMessage` 发起 IPC，附带 `prompt: string`
- 主进程 `electron/main/ipc/chat.ts` 用 `streamMessageInputSchema` 校验后调 `AcpSession.start(prompt: string)`
- `AcpSession.start` 内部把 `prompt` 包成 `[{ type: "text", text: prompt }]` 的 ACP `PromptPart` 数组（reminder 注入也是构造 text part 拼接）
- 进程池 `electron/main/infra/process/acp-process-pool.ts` 在 `startProcess` 中执行 `connection.initialize(...)`，把 `initializeResponse: InitializeResponse` 缓存在 `AgentProcess` 对象上，但仅作为内部状态

ACP 协议层（`@agentclientprotocol/sdk` 已安装）：

- `InitializeResponse.agentCapabilities.promptCapabilities` 字段：`{ image?: boolean; audio?: boolean; embeddedContext?: boolean; _meta? }`
- `ContentBlock` 支持 `text` / `image` / `audio` / `resource` / `resource_link`
- 协议规定 baseline 是 text 与 resource_link；其他类型须 agent 通过 `promptCapabilities` 显式声明

UI 层 `frontend/src/components/chat/prompt/`：

- `ChatPromptPanel.vue` 已构造 `attachments` ref，但 `handleSubmit` 只调 `chatStore.sendMessage(text)`，attachments 不进入发送流
- `PromptActionMenu.vue` 用 `useFileUpload` 组合两个文件选择器（图片 / 通用文件）
- `AttachmentList.vue` / `AttachmentCard.vue` 已经渲染附件预览
- `frontend/src/utils/chat-prompt-attachment.ts` 提供 `ChatPromptAttachment` 模型与 `createChatPromptAttachment` 构造器

持久化层 `electron/main/infra/storage/`：

- `session-store.ts` 提供 `sessionMessagesPath(projectPath, sessionId)` → `<userData>/projects/<encoded>/sessions/<sessionId>.messages.jsonl`
- `project-paths.ts` 暴露 `sessionsDir(projectPath)`，基于 `getDataSubPath('projects')` + `encodeProjectPath(projectPath)`
- `removeSession` 当前只删 `<sessionId>.json` 与 `<sessionId>.messages.jsonl`

ACP capability 是 agent 进程版本相关的不变量（与代码版本绑定，运行时不会变化）。冷启动期没有连接信息，但磁盘缓存可以提供最近一次 capability 快照。

## Goals / Non-Goals

**Goals:**

- 把 `promptCapabilities` 暴露给渲染端，UI 按能力启用 / 禁用图片、文件、audio 入口
- 把 chat prompt IPC 通道从单 `string` 改为 `ChatPromptPart[]`，支持 text / image / file 混合
- 附件统一落盘到 `<userData>` 目录树下、随 session 一起清理
- 持久化层（`*.messages.jsonl`）支持多 part user message，重启后能渲染历史附件
- 磁盘缓存 capability，避免冷启动 UI capability 盲区
- audio 入口集成（占位 + toast，不做实际发送）

**Non-Goals:**

- audio part 实际发送
- 拖拽 / 粘贴上传（沿用 `useFileUpload` 的点击选择）
- 工具产出 part 的多模态渲染（assistant 端不变）
- 缓存 `promptCapabilities` 之外的其他 `agentCapabilities` 字段（`loadSession` / `mcpCapabilities` 等通过运行时 `initializeResponse` 即时获取）
- 引用计数 / 单条消息删除时回收附件文件（当前没有删除单条消息的 UI）
- 修改 ACP `initialize` / `newSession` 流程

## Decisions

### D1: 磁盘缓存路径与 schema

**决策：** 缓存写到 `<userData>/acp/agent-capabilities.json`，结构为：

```json
{
  "version": 1,
  "agents": {
    "<agentId>": {
      "promptCapabilities": { "image": false, "audio": false, "embeddedContext": false },
      "capturedAgentVersion": "<installedVersion>",
      "capturedAt": "<ISO timestamp>"
    }
  }
}
```

**理由：**

- 与 `installed.json` 同目录（`getDataSubPath('acp')`），便于 backup / debug
- key 用 `AcpAgentEntry.id`，与 `installed.json` / registry 一致
- ACP 协议中 `promptCapabilities` 三个字段都是 optional boolean，落盘前归一化为 `false`，避免 undefined 三态
- `capturedAgentVersion` 用作失效信号：每次 `acp:ensureAgent` 启动时对比 `installed.installedVersion`，不一致则丢弃旧值并在 `initialize` 完成后重写
- schema 嵌套 `agents.<id>.promptCapabilities`，未来如需缓存其他 capability，可在同对象下加 sibling key 而不破 v1 schema

**备选：** 把 capability 直接写进 `installed.json` —— 拒绝。`installed.json` 由安装/卸载流程独占管理，混入运行时检测结果会污染 owner 边界。

### D2: 仅缓存 `promptCapabilities`

**决策：** v1 不缓存 `loadSession` / `mcpCapabilities` / unstable 字段。

**理由：**

- `loadSession`：当前 `acp-session-recovery` 通过运行时 `initializeResponse` 即时判断（`supportsResume` / `supportsLoad`），且 resume 流程要求进程已在线 —— 没有冷启动 UI 决策依赖，缓存零收益
- `mcpCapabilities.http / sse`：当前 codebase 用 stdio bundled MCP，http/sse 路径未启用
- `auth` / `nes` / `positionEncoding` 等：SDK 文档明确标 `@experimental`，写进磁盘 schema 会成为将来 SDK 改字段时的 migration 包袱

**备选：** 把全部 `agentCapabilities` 序列化落盘 —— 拒绝，扩面无收益且增加失效路径。

### D3: 附件统一落盘 + 发送时分叉

**决策：** 所有附件（图片 + 文件）一律先调 `chat:saveAttachment` 落盘，得到 `file://` URI；jsonl 持久化统一用 AI SDK `FileUIPart`：`{ type: "file", mediaType, url: "file://...", filename }`。发送 ACP prompt 时由 `AcpSession` 做分叉：

- `mediaType.startsWith("image/")` + `capability.image === true` → 主进程从 URI 读盘 → base64 → ACP `image` part `{ type: "image", mimeType, data }`
- 否则（文件） + `capability.embeddedContext === true` → ACP `resource_link` part `{ type: "resource_link", uri, name, mimeType }`

**理由：**

- 路径一致：所有附件落盘流程同一条，UI 不必区分 image / file 走不同保存路径
- jsonl 体积稳定，不内嵌 base64
- jsonl 中只存 `file://` URI，重启 / resume 后渲染端可直接通过 URI 渲染
- 发送时再分叉，不强制 agent 接受所有类型；capability gate 拦截

**备选 A：** 图片走纯 base64 内联（不落盘）—— 拒绝，与文件流程不一致，UI 处理两条路径。
**备选 B：** 持久化层用扩展 `image` / `resource_link` part 类型 —— 拒绝，偏离 AI SDK 默认契约且需要扩展 `UIMessage` 类型。

### D4: 附件目录归属随 session

**决策：** 附件路径 `<userData>/projects/<encoded(projectPath)>/sessions/<sessionId>/attachments/<uuid>.<ext>`。`removeSession` 时整个 `attachments/` 目录递归删除。不做引用计数，不在删除单条 message 时回收（当前没有删除单条消息的 UI）。

**理由：**

- 与现有 `<sessionId>.json` / `.messages.jsonl` 同 owner，生命周期一致
- session resume / 跨进程加载时路径稳定（`sessionId + uuid`）
- 实现成本低，spec 边界清晰

**备选：** 随 message —— 拒绝，需要引用计数 + 删除单条消息回调，过度设计。

### D5: capability 冷启动策略

**决策：** 三层兜底：

1. **磁盘缓存** `agent-capabilities.json`：渲染端启动期通过 `acp:loadCapabilitiesCache` IPC 同步加载到 `useAcpAgentsStore.promptCapabilitiesByAgent`
2. **运行时 ensureAgent**：用户切到某 agent 时，`ChatPromptPanel` watch agentId 触发 `acp:ensureAgent`；主进程懒启动进程并返回最新 `promptCapabilities`，同步写盘并通知渲染端 store 刷新
3. **未命中**：`agents[id]` 缺失（agent 刚装、从未连接过）→ 三个能力均视为 `false`，UI 入口全禁用；首次 `ensureAgent` 成功后自动启用

**进程崩溃失效：** 现有 `agentUnavailable` broadcast → `useAcpAgentsStore` 已经监听并清理 alive 状态；本次扩展为同时清理 `promptCapabilitiesByAgent.<agentId>`（强制下次 `ensureAgent`）。

**理由：** ACP capability 是 agent 版本绑定的常量，磁盘缓存在版本未变的情况下与运行时返回一致，可以直接用于冷启动 UI。`ensureAgent` 在版本变更或缓存不一致时纠偏。

### D6: 不兼容 capability 时拦截发送 + toast

**决策：** UI 入口禁用 + 发送拦截双层。已选附件如果在切换 agent 后变得不被支持（图片 part 时 `image: false`，或文件 part 时 `embeddedContext: false`），`handleSubmit` 返回 toast `"当前 agent 不支持 X 附件，请移除后再发送"` 并阻止发送，**不做隐式降级**（不会偷偷把文件转成文本）。

**理由：** 行为可预期；用户对发送内容有完全掌控；toast 引导 user 主动清理附件。

### D7: handleSubmit 组装顺序

**决策：** 严格按以下顺序组装 `ChatPromptPart[]`：

1. 始终先 push `text` part（即使 `input.value.trim() === ''` 但有附件，也 push 一个空 `text` part 占位）
2. 再依次 push 附件 part（按用户在 `attachments` 数组中的顺序，已是用户选择顺序）

**理由：** ACP `PromptRequest.prompt` 至少一个 part；`text` 在前更符合自然阅读 / agent 推理预期。空 text part 占位 vs 不发 text part：empty text part 对所有 agent 都是合法 baseline，简化 schema 校验（`min(1)` 即可）。

### D8: 持久化 vs 发送的 part 形态分离

**决策：** 引入两套 part 类型：

- `shared/types/chat-prompt.ts`：`ChatPromptPart`（IPC `chat:stream:message` 入参类型）
- `Message.parts`（jsonl 持久化）继续用 AI SDK `UIMessage<MessageMeta>['parts']`，user message 中可包含 `text` 与 `file` part

`AcpSession` 内部把 `ChatPromptPart[]` 转成 ACP SDK 的 `ContentBlock[]`（图片 part 时读盘 + base64）。

**理由：** IPC 边界类型不需要承担持久化 schema 的稳定性；持久化用 AI SDK 既有 `FileUIPart`，渲染端零成本。

### D9: Audio 按钮位置与行为

**决策：** 渲染于 `ChatPromptPanel.vue` 的 `#footer slot` 第二个内联块（即 `UChatPromptSubmit` 同行的左侧），独立 `<UButton>`：

- icon `i-lucide-audio-lines`
- size 与现有 `UChatPromptSubmit` 一致（`size="sm"`）
- `disabled` 由 `promptCapabilities.audio === true` 决定（`true` 启用、其他禁用）
- 启用态 click → `useToast().add({ title: "即将开放", color: "info" })`，**不修改任何 store / 不发送**
- 禁用态 tooltip：`"当前 agent 不支持音频输入"`

**理由：** 用户希望 audio 入口可见但暂时不可用；占位 + toast 保留 UI 心智一致性，未来集成时只替换 click handler。

## Risks / Trade-offs

- **[Risk] 跨平台 file:// URI 兼容**：macOS 路径含中文 / 空格时 ACP agent 是否能读 file://。→ Mitigation：URI 用 `pathToFileURL(absPath).toString()`（Node 内置），保证编码正确；Tasks 中加 e2e 验证。
- **[Risk] 图片 base64 内存峰值**：单图大于 10MB 时 base64 编码会增加 ~33% 内存峰值。→ Mitigation：`saveAttachment` 接受最大 25MB（与多数 ACP agent 上限一致）；`AcpSession` 转换图片 part 时使用 `fs.readFile` 一次性读取（Electron main 内存可承受），不优化为 stream（ACP `image` part 字段是单字符串）。
- **[Risk] 磁盘缓存与 agent 真实能力漂移**：用户手动替换 agent 二进制但版本号不变。→ Mitigation：`ensureAgent` 启动后用最新结果覆盖磁盘；用户能通过设置面板手动重连 agent 触发刷新（已有路径）。
- **[Risk] capability 缓存 schema 演进**：未来加 `loadSession` 缓存时 v1 文件无该字段。→ Mitigation：`version: 1` 头部 + agent 子对象用 `Partial`-friendly 解析，缺失字段视为未缓存；不做强制 migration。
- **[Trade-off] handleSubmit 总是发空 text part**：偶尔会让纯附件消息带个空 text。这是 agent 端 noise，但保持 schema 简单（`prompt.length >= 1`）；多数 agent 会忽略空文本。
- **[Trade-off] 不做拖拽 / 粘贴上传**：限制了交互流畅度，但 scope 之外。后续 change 可独立扩展 PromptActionMenu。

## Open Questions

无（所有决策点已与用户确认）。
