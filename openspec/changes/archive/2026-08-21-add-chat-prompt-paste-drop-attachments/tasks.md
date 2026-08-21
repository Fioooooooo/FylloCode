## 1. 固定附件输入 batch 契约与共享接收入口

- [x] 1.1 在 `src/renderer/src/composables/useChatAttachment.ts` 唯一声明并导出 `export type ChatAttachmentInputRejectionReason = "directory"` 与 `export type ChatAttachmentInputBatch = { files: File[]; preRejected?: Array<{ reason: ChatAttachmentInputRejectionReason; count: number }> }`；验收标准：目录是 `preRejected` 唯一允许的预拒绝原因，类型不在 `chat-prompt-attachment.ts` 或其他模块重复声明。
- [x] 1.2 在 `src/renderer/src/composables/useChatAttachment.ts` 将 `handleAttachmentSelect(files)` 改名为 `handleAttachmentInput(batch: ChatAttachmentInputBatch): void`，并更新 composable 返回值及 `ChatPromptPanel.vue` 调用点；验收标准：菜单、paste、drop 均只调用 `handleAttachmentInput()`，生产代码不再调用旧的 `handleAttachmentSelect()`。
- [x] 1.3 在 `src/renderer/src/composables/useChatAttachment.ts` 让 `handleAttachmentInput()` 按 `isImageAttachmentFile()` 派生图片/文件 capability 拒绝计数，只对通过 `promptCapabilities.image` 或 `promptCapabilities.embeddedContext` 的文件调用 `createChatPromptAttachment()` 和既有保存逻辑；验收标准：capability 拒绝与 `batch.preRejected` 合并为一次 toast，拒绝项不产生预览、attachment ID 或 `saveAttachment`，组件不生成 capability 文案。
- [x] 1.4 在 `src/renderer/src/components/chat/prompt/PromptActionMenu.vue` 将 `select-files` emit 固定为 `{ files: File[] }`，并让 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` 以 `handleAttachmentInput({ files })` 接收；验收标准：菜单只负责文件选择和既有 disabled 提示，不直接执行 capability 判断、toast 或保存。

## 2. 实现 ChatPrompt 粘贴、拖放与局部视觉状态

- [x] 2.1 在 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` 增加 paste handler，按 `ClipboardEvent.clipboardData.items` 顺序仅收集 `kind === "file"`、`getAsFile()` 返回 `File` 且 `isImageAttachmentFile(file)` 为 true 的项目，调用 `handleAttachmentInput({ files: imageFiles })`；验收标准：handler 在纯图片、纯文本、文本与图片混合、图片 capability 拒绝四种情况都不调用 `preventDefault()`，图片拒绝由 composable 反馈，混合内容的 `text/plain` 始终由浏览器插入。
- [x] 2.2 在 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` 实现 drop batch 构造：按 `dataTransfer.items` 原顺序忽略 `kind !== "file"`，对 `webkitGetAsEntry()?.isDirectory === true` 的文件项递增 `directoryCount`，其他文件项仅在 `getAsFile()` 返回 `File` 时加入 `files`，null 安全忽略；验收标准：调用 `handleAttachmentInput({ files, preRejected: directoryCount ? [{ reason: "directory", count: directoryCount }] : [] })`，去掉目录后文件相对顺序不变且不递归读取目录。
- [x] 2.3 在 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` 为文件拖放增加 `dragenter`、`dragover`、`dragleave`、`drop`、`dragend` 处理，使用数值型 `dragDepth` 维护局部状态，并绑定 `border-primary/40 bg-primary/5 transition-colors duration-150`；验收标准：文件拖放才调用 `preventDefault()` 并显示命中态，文本拖动不拦截，`drop`、有效 `dragleave`、取消和卸载后 `dragDepth` 均为 0，页面无 overlay/transform/shadow 动画。
- [x] 2.4 保持 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` 对 `useChatPrompt()` 的 `materializeAttachmentParts`、非空 text 提交校验和 `afterSubmit: clearAttachments` 连接；验收标准：新输入只增加 batch 来源，不改变 slash command、提交按钮、停止流、opaque handle 顺序和预览清理。

## 3. 守住草稿与 Session 生命周期边界

- [x] 3.1 在 `src/renderer/src/composables/useChatAttachment.ts` 让 `handleAttachmentInput()` 复用 `targetByAttachmentId`、`materializeAttachmentParts(target)` 和既有 active Session target 捕获，在接收时固定 `workspaceId/sessionId`；验收标准：已有 Session 的菜单、paste、drop 多次输入均不创建其他 Session，保存与 opaque handle 属于固定 target，顺序不变。
- [x] 3.2 验证 `src/renderer/src/composables/useChatAttachment.ts` 的草稿分支只更新 `attachments`、`fileByAttachmentId` 和本地预览，不调用 `chatApi.saveAttachment()`、`createSession()` 或新的持久化入口；验收标准：没有 active Session 时 paste/drop 后 Session 列表和 active Session 不变，提交失败仍保留文本、附件和可重试状态。
- [x] 3.3 保持 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` 与既有 `chat-message-submission` 的仅附件拒绝契约；验收标准：仅有 paste/drop 附件或 text trim 后为空时 submit disabled/统一入口拒绝，不创建 Session、追加 Message 或启动 ACP prompt，附件预览仍可补充文本或移除。

## 4. 扩展 Renderer 回归测试

- [x] 4.1 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 增加 ClipboardEvent helper，覆盖支持图片 Agent 的纯图片粘贴；验收标准：`preventDefault` 未调用，`handleAttachmentInput({ files: imageFiles })` 产生与菜单上传一致的图片预览，textarea 无可见图片文本。
- [x] 4.2 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 覆盖文本与图片混合粘贴的 capability 支持和拒绝两条路径；验收标准：两条路径均不调用 `preventDefault`，支持时图片预览出现且 `text/plain` 插入，拒绝时不保存图片、一次反馈且 `text/plain` 仍插入。
- [x] 4.3 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 覆盖纯文本粘贴和不含 `Files` 的文本拖动；验收标准：均不调用 `preventDefault`、不调用 `handleAttachmentInput`、不创建附件或拒绝反馈，并保留原生文本行为。
- [x] 4.4 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 覆盖图片/普通文件混合拖放；验收标准：`DataTransferItem` 原顺序经 `handleAttachmentInput()` 传递，受支持项按相对顺序出现在 `AttachmentList`，文件拖放只在 ChatPrompt surface 被拦截。
- [x] 4.5 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 覆盖图片和普通文件 capability 拒绝；验收标准：`image=false` 时图片、`embeddedContext=false` 时普通文件均不进入预览、不调用 `saveAttachment`，拒绝文案只由 `handleAttachmentInput()` 产生。
- [x] 4.6 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 覆盖混合批次部分接受且一次反馈；验收标准：支持项保留、不支持项被丢弃，`useToast().add` 在一次 batch 内只调用一次并同时说明各拒绝原因，支持项顺序不被重排。
- [x] 4.7 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 覆盖目录、普通文件和 `getAsFile() === null` 文件混合拖放；验收标准：目录仅计入 `preRejected` 的 `{ reason: "directory", count }`，null 文件安全忽略，不递归目录，同批次受支持文件仍按相对顺序加入。
- [x] 4.8 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 覆盖拖拽视觉状态清理；验收标准：`dragenter/dragover` 命中后，`dragleave`、`drop`、`dragend`/取消和 wrapper 卸载均将 `dragDepth` 清为 0，页面其他区域不存在 overlay 或残留边界。
- [x] 4.9 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 回归草稿态不创建 Session；验收标准：无 active Session 时 paste/drop 不调用 `createSession` 或 `saveAttachment`，预览保留，失败返回可重试。
- [x] 4.10 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 回归已有 Session 归属不变；验收标准：paste/drop 的保存与后续 `materializeAttachmentParts` 使用固定 `workspaceId/sessionId`，不切换 active Session，opaque handles 可按选择顺序提交。
- [x] 4.11 在 `test/renderer/src/components/chat-prompt-panel.spec.ts` 回归仅附件不可发送；验收标准：空 text 或纯空白 text 下 submit disabled/不调用 `sendMessage`，不会创建 Session、持久化 Message 或启动 stream，附件预览保持可见。

## 5. 实施后验证与边界复核

- [x] 5.1 运行 `pnpm exec vitest run --project renderer test/renderer/src/components/chat-prompt-panel.spec.ts` 并检查新增用例；验收标准：纯图片粘贴、文本与图片混合粘贴、拖放、能力拒绝、批次反馈、状态清理和既有提交回归全部通过。
- [x] 5.2 运行 `pnpm typecheck:web` 和与 renderer 相关的既有质量检查；验收标准：无新增 TypeScript、lint 或测试错误，且不引入依赖。
- [x] 5.3 检查最终变更范围；验收标准：只涉及本 change 的 proposal/design/spec/tasks/.openspec.yaml 与未来实现任务列出的 renderer/test 文件，不修改 Main、IPC、preload、schema、`guidelines/**`、既有 `openspec/specs/**` 或 `chat-composer` 迁移内容。
