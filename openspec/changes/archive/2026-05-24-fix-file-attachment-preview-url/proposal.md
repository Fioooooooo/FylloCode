## Why

用户消息中的图片附件持久化为 `file://` URI，但当前 `UIMessageList` 将 `part.url` 原样传给 `<img>`，在 Electron 渲染环境中会导致历史消息里的本地图片缩略图不可显示。这个问题直接影响附件消息的可读性，需要在不改变存储与 ACP 发送语义的前提下修复显示层。

## What Changes

- 修改用户消息图片附件的渲染契约：`UIMessageList` 不再要求 `<img>` 直接使用 `part.url`；当 `part.url` 为 `file://` URI 时，渲染层通过新增 IPC 读取图片并使用返回的 data URL 作为 `<img src>`。
- 新增 `chat:readAttachmentDataUrl` IPC：入参 `{ uri, mediaType }`，主进程读取 `file://` 指向的本地图片文件并返回 `IpcResponse<{ dataUrl: string }>`，其中 `dataUrl` 形如 `data:<mediaType>;base64,<content>`。
- 对非 `file://` 字符串 URL 保持原样，缺失或非字符串 URL 返回空字符串。
- 本次不为读取接口设置大小上限，也不在渲染层增加 data URL 缓存；每个图片 part 按组件生命周期发起读取并更新本地显示状态。
- 保持附件持久化、`UIMessage.parts` 数据结构、`chat:saveAttachment` 返回值和 ACP prompt 转换逻辑不变，仍然以 `file://` URI 作为数据层来源。
- 为新增 IPC、preload/API 封装和前端图片 src 解析增加测试，覆盖 `file://` 读取、普通 URL、空值和非字符串值。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-interface`：修改用户消息图片附件缩略图的 `src` 生成要求，从直接使用 `part.url` 改为在 `file://` 场景通过 `chatApi.readAttachmentDataUrl` 获取 data URL。
- `chat-attachments`：新增 `chat:readAttachmentDataUrl` IPC，用于渲染端把已持久化的 `file://` 图片附件读取为 data URL。

## Impact

- 影响前端组件：`frontend/src/components/shared/UIMessageList.vue`
- 影响前端工具函数：`frontend/src/utils/chat-message-parts.ts`
- 影响前端测试：`frontend/src/__tests__/utils/chat-message-parts.test.ts`，必要时补充 `UIMessageList` 组件测试
- 影响 IPC：`shared/types/channels.ts`、`shared/schemas/ipc/chat.ts`、`electron/main/ipc/chat.ts`、`electron/preload/api/chat.ts`、`electron/preload/index.d.ts`、`frontend/src/api/chat.ts`
- 影响规范：`openspec/specs/chat-interface/spec.md`、`openspec/specs/chat-attachments/spec.md`
- 不修改附件持久化格式、`chat:saveAttachment` 语义、ACP prompt 转换逻辑或附件落盘路径
