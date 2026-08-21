## Why

当前 `ChatPromptPanel` 只通过附加功能菜单接收图片和文件，用户无法把已在剪贴板中的图片直接带入 prompt，也无法把文件从桌面或文件管理器拖入 prompt。这个缺口迫使用户先保存文件再打开选择器，打断了连续的聊天输入流程。

粘贴和拖放还必须与菜单上传共享同一条附件接收、文件分类、Agent capability 校验和生命周期路径。paste handler 永远不调用 `preventDefault()`：它提取图片交给附件入口，同时让浏览器继续插入剪贴板中的 `text/plain`；因此文本与图片混合粘贴不会丢失文本，纯图片在 textarea 中也不会产生可见文本。若 Agent 不支持图片，图片只被拒绝并反馈，混合内容中的文本仍正常插入。若为新入口各自实现处理逻辑，容易绕过 `promptCapabilities.image` / `embeddedContext`、产生重复的 Session 作用域保存，或破坏现有草稿、opaque handle、顺序和失败回滚契约。本变更只扩展输入入口，不改变既有消息提交模型。

## What Changes

- 在 `ChatPromptPanel` surface 接收剪贴板图片；paste handler 永远不调用 `preventDefault()`，提取出的图片交给共享附件入口，同时保留浏览器对 `text/plain` 的原生插入。纯图片剪贴板在 textarea 中不产生可见文本；图片不受支持时只拒绝图片并反馈，混合剪贴板中的文本仍插入。
- 在同一 surface 接收图片和普通文件拖放，只拦截包含文件的拖放；按 `DataTransferItem` 原顺序忽略非 `file` 项，目录项（`webkitGetAsEntry()?.isDirectory === true`）只计入 `directoryCount`，其他 `file` 项仅在 `getAsFile()` 返回 `File` 时加入，null 安全忽略；文本拖动继续使用原生行为，首版不递归读取目录。
- 在 `src/renderer/src/composables/useChatAttachment.ts` 固定声明并导出 `ChatAttachmentInputRejectionReason = "directory"`、`ChatAttachmentInputBatch = { files: File[]; preRejected?: Array<{ reason: ChatAttachmentInputRejectionReason; count: number }> }`，并将共享入口固定为 `handleAttachmentInput(batch: ChatAttachmentInputBatch)`。菜单传 `{ files }`，paste 传 `{ files: imageFiles }`，drop 传 `{ files, preRejected: directoryCount ? [{ reason: "directory", count: directoryCount }] : [] }`。
- `handleAttachmentInput()` 按现有 `isImageAttachmentFile` 语义分类：图片要求 `promptCapabilities.image`，非图片文件要求 `promptCapabilities.embeddedContext`；capability 拒绝由该函数内部派生，并与 `preRejected` 合并为一次汇总反馈，组件不生成 capability 文案。
- 混合批次只加入受支持的文件；拒绝项通过一次汇总反馈说明 capability 不支持或目录不可接收等原因，Agent 不支持时不创建附件并明确告知用户。
- 仅在 ChatPrompt surface 展示拖拽命中状态，使用现有 Nuxt UI/Tailwind 语义颜色、背景和边界；不增加全页面 overlay、几何变换、阴影动画或新依赖。
- 保持现有 `chat-message-submission` 契约：草稿态不因附件输入创建 Session，已有 Session 继续固定附件归属，附件仍不能单独发送，opaque handle、选择顺序、失败回滚和预览清理保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-message-submission`：增加 ChatPrompt 的剪贴板图片粘贴、图片/普通文件拖放、统一 capability 校验、批次拒绝反馈和 surface 拖拽视觉状态要求。

## Impact

- 预计修改范围集中在 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue`、`src/renderer/src/components/chat/prompt/PromptActionMenu.vue` 和 `src/renderer/src/composables/useChatAttachment.ts`；三者复用 `src/renderer/src/utils/chat-prompt-attachment.ts` 的 `isImageAttachmentFile()`，菜单上传继续作为共享入口的一个来源。
- 需要扩展 `test/renderer/src/components/chat-prompt-panel.spec.ts`，覆盖纯图片粘贴、文本粘贴、文本与图片混合粘贴（支持与拒绝两种 capability）、混合拖放、capability 拒绝、目录拒绝、反馈汇总、拖拽状态清理以及既有提交生命周期不变量。
- 不修改 Main、IPC、preload、持久化 schema、ACP prompt part、附件目录格式、`chat-message-submission` 的既有提交契约或附件 handle 结构；不新增依赖。
- 不迁移 `src/renderer/src/features/chat-composer/`，因为该目录当前只是未来方向 README；不添加 repository guideline 更新任务，也不改变测试布局、通用 UI 约定或现有命令。
