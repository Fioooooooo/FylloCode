---
name: IPC
description: FylloCode 的主渲染通信契约、channel 规则、bridge 暴露与错误模型
keywords: [ipc, electron, preload, channels, contracts]
---

# IPC

## Purpose

定义主进程、预加载脚本和渲染进程之间的通信模型、channel 命名、payload 校验、响应格式和流式协议。任何涉及新增或修改 `window.api`、IPC channel、shared schema、错误码或 MessagePort 流程的工作，都必须先阅读本文档。

## Applicability

- 适用于 `electron/main/ipc/**`、`electron/preload/**`、`shared/types/channels.ts`、`shared/schemas/ipc/**`、`shared/types/ipc.ts`、`shared/constants/error-codes.ts`。
- 适用于 `frontend/src/api/**` 中对 `window.api.*` 的消费。
- 不覆盖主进程内部 service/domain/infra 分层；见 `guidelines/MainProcess.md`。

## Sources of Truth

- `shared/types/channels.ts`
- `shared/schemas/ipc/**`
- `shared/types/ipc.ts`
- `shared/constants/error-codes.ts`
- `shared/errors/ipc-error.ts`
- `electron/main/ipc/**`
- `electron/preload/api/**`
- `electron/preload/index.d.ts`
- `frontend/src/api/**`
- `openspec/specs/ipc-protocol/spec.md`
- `openspec/specs/ipc-request-response/spec.md`
- `openspec/specs/ipc-streaming/spec.md`
- `openspec/specs/proposal-ipc/spec.md`
- `openspec/specs/workflow-ipc/spec.md`

## Rules

- MUST: 将所有 channel 名称定义在 `shared/types/channels.ts`，禁止在主进程、preload 或 renderer 中散落字符串字面量。
- MUST: 使用 `domain:action` 作为 channel 命名格式，其中 domain 表示功能领域，而不是页面入口或 UI 路由。
- MUST: 让每个 handle 型 channel 返回 `IpcResponse<T>`，错误分支返回 `IpcErrorInfo`，而不是抛出 renderer 侧难以消费的任意结构。
- MUST: 让主进程 handler 的入参通过 `shared/schemas/ipc/<domain>.ts` 中的 Zod schema 校验；渲染侧类型声明不能替代运行时校验。
- MUST: 让 preload 通过 `contextBridge` 暴露 `window.api`，渲染层只能消费这些公开 API，不得直接触碰 `ipcRenderer`。
- MUST: 让流式协议通过 `ipc/_kit/stream-channel.ts` 与 `MessagePort` 实现，chunk/done/error 消息结构遵循 `shared/types/ipc.ts`。
- MUST: 将新增错误码登记到 `shared/constants/error-codes.ts`；不得返回未声明的错误码字符串。
- MUST: 在 `frontend/src/api/` 中为每个公开 bridge 方法提供对等薄封装，保持 renderer 对 IPC 的访问点可搜索、可替换、可测试。
- SHOULD: 让 `electron/preload/index.d.ts` 与 `electron/preload/api/**` 同步更新，避免桥接实现与类型声明脱节。
- SHOULD: 按业务域组织 schema 和 channel，例如 `chat`、`proposal`、`workflow`、`integration`，避免把所有通信契约塞进单个大文件。
- MAY: 为事件型 channel 在 preload 中提供 `onXxx` / `offXxx` 风格封装，但不要把订阅系统散落到业务组件层直接实现。

## Examples

- Good: 在 `shared/schemas/ipc/proposal.ts` 增加入参 schema，在 `electron/main/ipc/proposal.ts` 里 `validate -> service -> return`，在 `electron/preload/api/proposal.ts` 暴露 bridge，再由 `frontend/src/api/proposal.ts` 封装调用。
- Good: 使用 `IpcErrorCodes.PROJECT_NOT_FOUND` 这类集中登记的错误码，而不是字符串 `"PROJECT_NOT_FOUND"` 字面量。
- Good: `chat:stream:*`、`proposal:*:port` 一类流式通道通过 `MessagePort` 传递分块事件。
- Bad: 在 renderer 组件中直接 `ipcRenderer.invoke("proposal:list", input)`。
- Bad: 在 handler 内手写 `{ ok: false, error: { code: "UNKNOWN", ... } }` 并绕过共享错误码类型。

## Multimodal Prompt Channels

- `acp:ensureAgent`：入参 `{ agentId: string }`，返回 `IpcResponse<{ promptCapabilities: { image: boolean; audio: boolean; embeddedContext: boolean } }>`；用于懒启动 / 复用 ACP agent 并读取归一化 prompt capability。启动失败沿用 ACP 启动错误码，如 `ACP_NOT_READY`、`ACP_EXIT_GIVEUP`、`SPAWN_ERROR`、`ACP_ERROR`。
- `acp:loadCapabilitiesCache`：无入参，返回 `IpcResponse<Record<agentId, AcpPromptCapabilities>>`；用于 renderer 启动期读取 `<userData>/acp/agent-capabilities.json` 的内存快照。
- `chat:saveAttachment`：入参 `{ projectId, sessionId, fileName, mimeType, base64Data }`，其中 `base64Data` 解码后不得超过 25 MB；返回 `IpcResponse<{ uri: string; name: string; mimeType: string }>`，`uri` 为 `file://`。校验失败返回 `VALIDATION_ERROR`。
- `chat:stream:message` 的 `prompt` 字段为 `ChatPromptPart[]`；当 prompt part 与 agent capability 不匹配时，主进程返回 `PROMPT_CAPABILITY_MISMATCH`。

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm vitest run electron/main/__tests__/ipc/**/*.spec.ts`
- `pnpm vitest run electron/main/__tests__/preload/**/*.spec.ts`
- `pnpm vitest run shared/__tests__/**/*.{test,spec}.ts`
- 若改动包含新 channel，检查 `shared/types/channels.ts`、`shared/schemas/ipc/**`、`electron/preload/index.d.ts`、`frontend/src/api/**` 是否一并更新。

## Maintenance

- 当 channel 命名策略、bridge 暴露方式、共享响应结构、错误码来源或流式协议变化时，必须更新本文档。
- 当新增功能域引入一组新的 IPC 接口时，应补充 Rules/Examples 中的代表性路径，而不是把本文档扩写成完整 API 手册。
- 若 OpenSpec 中的 `ipc-*` capability 修改了行为契约，应先更新 spec，再同步本文档。
