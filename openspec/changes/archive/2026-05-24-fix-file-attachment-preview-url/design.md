## Context

附件发送链路已经约定：用户选择文件后由 `chat:saveAttachment` 落盘，并返回 `file://` URI；jsonl 中的 AI SDK `FileUIPart` 使用 `{ type: "file", mediaType, url: "file://...", filename }` 保存。ACP 发送链路也依赖该 URI：图片由主进程读盘后转 base64，普通文件作为 `resource_link` 传给 agent。

当前失败点在显示层：`frontend/src/components/shared/UIMessageList.vue#getFilePartUrl` 只返回原始字符串，图片分支把它直接传给 `<img :src>`。历史消息加载后 renderer 只有 `file://` URI，没有原始 `File` 对象，也不能直接读本地文件，因此显示层需要通过主进程读取文件内容并拿到可赋给 `<img src>` 的 data URL。

## Goals / Non-Goals

**Goals:**

- 修复历史用户消息中 `file://` 图片附件缩略图不可显示的问题。
- 保持 `UIMessage.parts`、jsonl 持久化、`chat:saveAttachment` 返回值、ACP prompt 转换语义不变。
- 新增受控 IPC，让主进程把 `file://` 图片附件读取为 data URL，renderer 只消费 `window.api.chat` / `frontend/src/api/chat.ts` 封装。
- 将 URL / data URL 解析逻辑放在可测试的前端函数或组件逻辑中，避免模板内继续直接透传本地文件 URI。
- 让 `chat-interface` spec 明确区分“数据层 URL”与“图片显示 src”。

**Non-Goals:**

- 不增加附件下载、打开文件、PDF 预览或 assistant file part 渲染。
- 不修改附件落盘目录、文件大小限制、IPC schema 或 ACP 消息映射。
- 不引入新的外部依赖。
- 不把 renderer 改成直接访问 Node `path`、`fs` 或 Electron 原生 API。
- 不在渲染层增加 data URL 缓存。
- 不为本次读取接口设置文件大小上限。

## Decisions

### Decision: 持久化仍保留 `file://`，显示时通过 IPC 读取为 data URL

`part.url` 继续表示数据层来源，仍由 `chat:saveAttachment` 返回并持久化为 `file://` URI。图片显示时，如果 `part.url` 是 `file://`，renderer 通过 `frontend/src/api/chat.ts` 调用新增的 `chat:readAttachmentDataUrl`，由 main process 读取文件并返回 `data:<mediaType>;base64,<content>`；`<img src>` 使用该 data URL。`http:`、`https:`、`data:`、`blob:` 等非 file 字符串仍原样用于 `<img src>`；缺失或非字符串 URL 返回空字符串。

这样可以避免把显示层兼容逻辑扩散到存储、ACP 发送或 schema 校验中。

### Decision: 新增 `chat:readAttachmentDataUrl` IPC

新增 channel `ChatChannels.readAttachmentDataUrl = "chat:readAttachmentDataUrl"`。入参 schema 位于 `shared/schemas/ipc/chat.ts`，建议命名 `readAttachmentDataUrlInputSchema`，校验：

- `uri` 为非空字符串且以 `file://` 开头
- `mediaType` 为非空字符串且以 `image/` 开头

handler 位于 `electron/main/ipc/chat.ts`，保持现有 handler 模式：`validate(schema, input)` → 调用 service / infra helper → 返回 `IpcResponse<T>`。读取逻辑放在 `electron/main/infra/storage/attachment-store.ts` 或同层附件 storage helper 中，使用 `fileURLToPath(uri)` 转成本地路径、`fs.readFile` 读取 Buffer，再拼出 data URL。

本次按用户确认不做读取大小限制；因此 schema 不检查文件字节数，storage helper 也不在读取前拒绝大文件。

### Decision: 渲染层不做 data URL 缓存

`UIMessageList.vue` 对每个 user image file part 在组件生命周期内异步解析图片 src。非 `file://` URL 同步原样使用；`file://` URL 初始可为空字符串，IPC 成功后更新为 data URL。组件不维护跨消息、跨 session 或全局缓存，也不在 `frontend/src/utils/chat-message-parts.ts` 中加入缓存 map。

### Decision: 文件名片不使用转换后的 URL

非图片附件仍只显示文件名、扩展标签和图标，不做内容预览，也不需要生成显示用 src。转换 helper 的主要验收对象是 `isUserImagePart(part)` 命中的图片分支。

## Risks / Trade-offs

- [Risk] 大图片经 IPC 转 base64 会增加内存占用和传输体积。→ Mitigation：本次按范围优先快速修复，不设大小上限、不做缓存；若后续出现性能问题，再改为自定义协议或按需缓存。
- [Risk] renderer 异步读取期间图片短暂为空。→ Mitigation：保持现有图片卡片外壳，`src` 初始为空，成功后更新；读取失败不影响其他消息渲染。
- [Risk] spec 中存在两处图片附件渲染描述，归档时可能只改一处。→ Mitigation：delta spec 同时修改“共享 UIMessage 列表组件”和“附件用户消息渲染图片缩略图与文件名片”两个 requirement 中的图片 src 描述。
- [Risk] `file://` URI 中包含中文、空格或已编码字符。→ Mitigation：main process 使用 `fileURLToPath(uri)` 处理 URI，不手写 decode/encode 路径；测试至少覆盖含空格或中文路径的 URI。
