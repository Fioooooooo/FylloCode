# chat-attachments Specification

## Purpose

TBD - created by archiving change add-multimodal-prompt-parts. Update Purpose after archive.

## Requirements

### Requirement: 附件落盘路径与所有权随 session

系统 SHALL 把 chat prompt 附件文件落盘到：

```
<userData>/projects/<encodeProjectPath(projectPath)>/sessions/<sessionId>/attachments/<uuid>.<ext>
```

- 路径基于 `electron/main/infra/storage/project-paths.ts` 的 `sessionsDir(projectPath)` 派生
- `<uuid>` 由主进程 `crypto.randomUUID()` 生成
- `<ext>` 取自原始文件名扩展（缺失时使用 mimeType 的 subtype，如 `image/png` → `png`，全部缺失时省略扩展）
- 附件目录的所有权随 session：`removeSession` 时整个 `attachments/` 目录递归删除
- 不做引用计数，不在删除单条 message 时回收（当前没有删除单条消息的 UI）

文件 IO SHALL 经由 `electron/main/infra/storage/attachment-store.ts` 提供的统一 API（`saveAttachment(projectPath, sessionId, fileName, mimeType, base64) → { absolutePath, fileUri, name, mimeType }`、`removeSessionAttachments(projectPath, sessionId)`）。其他模块 MUST NOT 直接拼接路径写文件。

#### Scenario: 保存附件返回 file:// URI

- **WHEN** `attachment-store.saveAttachment` 被调用
- **THEN** 返回值的 `fileUri` 由 `pathToFileURL(absolutePath).toString()` 生成
- **AND** `name` 为原始文件名
- **AND** `mimeType` 为入参 mimeType（缺失时落盘文件中也作为后续 part 的 mediaType 使用）

#### Scenario: 路径含中文 / 空格

- **WHEN** `projectPath` 或文件名含中文 / 空格 / 特殊字符
- **THEN** 写入路径正常（`encodeProjectPath` 已规范 projectPath；UUID 文件名避免原始名冲突）
- **AND** `fileUri` 通过 `pathToFileURL` 编码，可被 ACP agent 读取

### Requirement: chat:saveAttachment IPC

系统 SHALL 实现 `chat:saveAttachment` IPC handler，入参 `{ projectId, sessionId, fileName, mimeType, base64Data }`，返回 `IpcResponse<{ uri: string; name: string; mimeType: string }>`。

入参校验 SHALL 通过 `shared/schemas/ipc/chat.ts` 的 `saveAttachmentInputSchema`：

- `projectId` / `sessionId` / `fileName` 非空字符串
- `mimeType` 非空字符串
- `base64Data` 为合法 base64 字符串
- 解码后字节数 SHALL 不超过 25 MB（拒绝时返回 `VALIDATION_ERROR`）

handler SHALL 通过 `projectId` 解析 `projectPath`（复用现有 project-store API），调 `attachment-store.saveAttachment`，返回 `{ uri, name, mimeType }`。

#### Scenario: 渲染进程上传附件

- **WHEN** 渲染进程调用 `chat:saveAttachment` 并传入合法入参
- **THEN** 主进程 base64 解码，写到目标路径
- **AND** 返回 `{ uri: "file:///...", name: <原始文件名>, mimeType: <入参 mimeType> }`

#### Scenario: 入参超限被拒

- **WHEN** `base64Data` 解码后字节数超过 25 MB
- **THEN** handler 返回 `IpcResponse.error({ code: "VALIDATION_ERROR", message })`
- **AND** 不写入文件系统

### Requirement: removeSession 清理 attachments 目录

系统 SHALL 在 `chat:removeSession` 删除 `<sessionId>.json` 与 `<sessionId>.messages.jsonl` 时，同时通过 `attachment-store.removeSessionAttachments(projectPath, sessionId)` 递归删除 `<sessionId>/attachments/` 目录。

attachments 目录不存在时 `removeSessionAttachments` SHALL 静默通过，不抛错。

#### Scenario: 删除 session 同时清理附件

- **WHEN** 渲染进程调用 `chat:removeSession({ id, projectId })`
- **AND** 该 session 在 `attachments/` 目录下有附件文件
- **THEN** 主进程删除 `.json` / `.messages.jsonl` 文件
- **AND** 递归删除 `attachments/<sessionId>/` 整个目录

#### Scenario: 删除从未上传附件的 session

- **WHEN** session 没有 attachments 目录
- **THEN** `removeSessionAttachments` 不抛错
- **AND** `removeSession` 整体仍返回 ok

### Requirement: jsonl 持久化使用 AI SDK FileUIPart

系统 SHALL 在 `<sessionId>.messages.jsonl` 中持久化的 user message `parts` 数组里，把附件以 AI SDK `FileUIPart` 形式存储：

```ts
{ type: "file", mediaType: string, url: string, filename: string }
```

- `mediaType` 来自上传时的 mimeType（图片为 `image/*`，文件为对应 mimeType）
- `url` 为 `file://` 绝对路径 URI（由 `chat:saveAttachment` 返回的 `uri`）
- `filename` 为原始文件名（用户在 attachments UI 中看到的名字）

不在 jsonl 中内嵌 base64。session resume / loadSession 后渲染端通过 URI 直接渲染附件预览。

#### Scenario: 用户消息持久化包含附件

- **WHEN** 用户发送一条带附件的消息
- **THEN** 主进程持久化的 user UIMessage 的 `parts` 形如 `[{ type: "text", text }, { type: "file", mediaType, url, filename }]`

#### Scenario: 历史 session 加载还原附件渲染

- **WHEN** 用户切换到含附件的历史 session
- **THEN** 渲染端从 jsonl 读取 `FileUIPart`，使用 `url` 渲染图片预览或文件名片

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
