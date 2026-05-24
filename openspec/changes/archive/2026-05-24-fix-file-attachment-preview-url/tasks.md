## 1. IPC 与主进程读取

- [x] 1.1 修改 `shared/types/channels.ts`，在 `ChatChannels` 增加 `readAttachmentDataUrl: "chat:readAttachmentDataUrl"`。
- [x] 1.2 修改 `shared/schemas/ipc/chat.ts`，新增并导出 `readAttachmentDataUrlInputSchema`，校验 `{ uri, mediaType }`：`uri` 为非空字符串且以 `file://` 开头，`mediaType` 为非空字符串且以 `image/` 开头；不要增加文件大小上限校验。
- [x] 1.3 在 `electron/main/infra/storage/attachment-store.ts` 新增读取 helper（建议命名 `readAttachmentDataUrl(uri: string, mediaType: string): Promise<string>`），使用 `fileURLToPath(uri)` 和 `fs.readFile` 读取文件，返回 `data:${mediaType};base64,${buffer.toString("base64")}`；不要增加读取大小上限。
- [x] 1.4 修改 `electron/main/ipc/chat.ts`，注册 `ChatChannels.readAttachmentDataUrl` handler：使用 `validate(readAttachmentDataUrlInputSchema, input)` 校验，调用 storage helper，返回 `IpcResponse<{ dataUrl: string }>`；异常沿用现有 `wrapHandler` 归一化路径。

## 2. Preload 与 Renderer API

- [x] 2.1 修改 `electron/preload/api/chat.ts`，新增 `readAttachmentDataUrl(uri: string, mediaType: string): Promise<IpcResponse<{ dataUrl: string }>>`，内部调用 `ipcRenderer.invoke(ChatChannels.readAttachmentDataUrl, { uri, mediaType })`。
- [x] 2.2 修改 `electron/preload/index.d.ts`，为 `window.api.chat.readAttachmentDataUrl` 增加同名类型声明。
- [x] 2.3 修改 `frontend/src/api/chat.ts`，新增 `chatApi.readAttachmentDataUrl(uri, mediaType)` 薄封装，renderer 业务代码不得直接调用 `window.api.chat.readAttachmentDataUrl`。

## 3. UIMessageList 图片显示

- [x] 3.1 修改 `frontend/src/utils/chat-message-parts.ts`，新增同步 helper（建议命名 `getFilePartRawUrl(part)` 或 `getFilePartUrl(part)`）读取 `part.url`：非字符串返回 `""`，字符串返回原值；保留 `isUserImagePart` / `isUserFilePart` 判定规则不变。
- [x] 3.2 修改 `frontend/src/components/shared/UIMessageList.vue`：删除组件内本地 `getFilePartUrl`，改用 utils helper 读取原始 URL；当 user image part 的 URL 不是 `file://` 时直接作为 `<img src>`。
- [x] 3.3 在 `UIMessageList.vue` 中为 user image part 的 `file://` URL 调用 `chatApi.readAttachmentDataUrl(url, mediaType)`，成功后把 `<img src>` 更新为返回的 `dataUrl`；读取过程中可使用空字符串作为 `src`，读取失败不影响文件名片、文本、工具和其他消息渲染。
- [x] 3.4 不在渲染层增加 data URL 缓存：不要引入跨消息、跨 session 或全局 `Map` 缓存；组件生命周期内的局部响应式显示状态仅用于承载当前异步读取结果。

## 4. 测试

- [x] 4.1 扩展 `electron/main/__tests__/infra/storage/attachment-store.test.ts`：覆盖 `readAttachmentDataUrl` 读取 `file://` 图片并返回 `data:<mediaType>;base64,...`，测试 URI 至少包含空格或中文字符。
- [x] 4.2 扩展 `shared` 或 `electron/main` 相关 schema 测试：覆盖 `readAttachmentDataUrlInputSchema` 接受 `file://` + `image/*`，拒绝非 file URI 与非 image mediaType；确认不存在大小上限断言。
- [x] 4.3 扩展 `electron/main/__tests__/ipc` 或现有 chat IPC 测试：覆盖 `chat:readAttachmentDataUrl` 成功返回 `{ dataUrl }`，以及 schema 校验失败返回 `VALIDATION_ERROR`。
- [x] 4.4 扩展 preload/API 测试或类型测试：覆盖 `electron/preload/api/chat.ts` 与 `frontend/src/api/chat.ts` 新方法调用正确 channel / bridge 方法。
- [x] 4.5 扩展 `frontend/src/__tests__/utils/chat-message-parts.test.ts`：覆盖新增 URL helper 对字符串、缺失值、非字符串值的返回；保留既有 `isUserImagePart` / `isUserFilePart` 测试。
- [x] 4.6 如项目已有 `UIMessageList` 组件测试，则补充 user image file URL 场景，mock `chatApi.readAttachmentDataUrl` 并断言 `<img>` 最终使用 data URL；若没有现成测试，可在实现说明中记录只覆盖 helper 与 API 层。

## 5. 验证与文档

- [x] 5.1 运行 `pnpm vitest run frontend/src/__tests__/utils/chat-message-parts.test.ts`，确保 URL helper 与既有 part 判定测试通过。
- [x] 5.2 运行新增或受影响的 main/preload/shared 测试，至少覆盖 storage helper、schema、IPC handler 与 preload/API 封装。
- [x] 5.3 运行 `pnpm typecheck`，确保新增 channel、schema、preload 类型与 renderer 调用全部通过。
- [x] 5.4 更新 `guidelines/IPC.md` 的 Multimodal Prompt Channels，补充 `chat:readAttachmentDataUrl` 的用途、入参、返回值与“本次不设读取大小上限”约束。
