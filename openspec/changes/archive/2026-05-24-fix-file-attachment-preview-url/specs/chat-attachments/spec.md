## ADDED Requirements

### Requirement: chat:readAttachmentDataUrl IPC

系统 SHALL 实现 `chat:readAttachmentDataUrl` IPC handler，用于 renderer 在显示历史用户消息图片附件时，把已持久化的 `file://` 图片 URI 读取为 data URL。该 channel SHALL 使用请求-响应模式，入参为 `{ uri: string; mediaType: string }`，返回 `IpcResponse<{ dataUrl: string }>`.

入参校验 SHALL 通过 `shared/schemas/ipc/chat.ts` 的 `readAttachmentDataUrlInputSchema`：

- `uri` 为非空字符串且必须以 `file://` 开头
- `mediaType` 为非空字符串且必须以 `image/` 开头
- 本次读取接口 SHALL NOT 校验文件大小上限

handler SHALL 在 `electron/main/ipc/chat.ts` 注册，使用 `validate(readAttachmentDataUrlInputSchema, input)` 校验入参，并调用 `electron/main/infra/storage/attachment-store.ts` 提供的读取 helper。读取 helper SHALL 使用 `fileURLToPath(uri)` 转换 URI，使用 `fs.readFile` 读取文件内容，并返回 `data:${mediaType};base64,${buffer.toString("base64")}`。读取失败 SHALL 通过现有 `wrapHandler` 错误归一化路径返回失败响应，不得让异常直接穿透到 renderer。

preload SHALL 在 `electron/preload/api/chat.ts` 暴露 `readAttachmentDataUrl(uri, mediaType)`，renderer SHALL 通过 `frontend/src/api/chat.ts` 的 `chatApi.readAttachmentDataUrl(uri, mediaType)` 薄封装调用，不得直接访问 `window.api.chat.readAttachmentDataUrl`。

#### Scenario: 读取 file 图片附件为 data URL

- **WHEN** renderer 调用 `chatApi.readAttachmentDataUrl("file:///abs/%E6%88%AA%E5%9B%BE%201.png", "image/png")`
- **THEN** main process 读取该 file URI 指向的文件
- **AND** 返回 `{ ok: true, data: { dataUrl: "data:image/png;base64,<content>" } }`

#### Scenario: 入参不是 file URI

- **WHEN** renderer 调用 `chatApi.readAttachmentDataUrl("https://example.com/x.png", "image/png")`
- **THEN** handler 返回 `VALIDATION_ERROR`
- **AND** 不读取文件系统

#### Scenario: 入参不是图片 mediaType

- **WHEN** renderer 调用 `chatApi.readAttachmentDataUrl("file:///abs/doc.pdf", "application/pdf")`
- **THEN** handler 返回 `VALIDATION_ERROR`
- **AND** 不读取文件系统

#### Scenario: 读取接口不限制文件大小

- **WHEN** `readAttachmentDataUrlInputSchema` 校验合法的 `file://` URI 与 `image/*` mediaType
- **THEN** schema 不按文件大小拒绝入参
- **AND** handler 不在读取前执行 25 MB 或其他字节数上限检查
