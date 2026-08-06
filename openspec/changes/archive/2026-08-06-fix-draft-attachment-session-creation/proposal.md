## Why

草稿态选择附件会在用户尚未发送消息时提前创建并激活 Session；一次选择多个文件时，并行上传还会为每个文件创建不同 Session，最终导致标题停留在 `New Session`，并在发送时触发跨 Session attachment 拒绝。与此同时，当前 renderer 实现允许无文本、仅附件的消息通过，与产品要求“每次消息必须包含 text”不一致。

## What Changes

- 草稿态选择图片或文件时只维护本地待提交附件和预览，不创建、不持久化、不激活 Session，也不向左侧列表插入条目。
- 首次提交时先验证存在非空的用户 text，按既有规则从 text 生成 Session 标题，并复用 ready probe 创建唯一真实 Session；随后把同批附件全部持久化到该 Session，再持久化用户消息并启动 ACP prompt。
- 已有 Session 中选择附件时继续把附件保存到当前 Session，不改变既有 attachment handle 和预览语义。
- 首次 Session 创建、附件保存或首条消息持久化失败时回滚新建 Session 及附件，保留草稿内容和 ready probe，不留下空 Session 或错误 active 状态。
- **BREAKING**：每次用户消息必须包含至少一个 trim 后非空的非 system-reminder `text` part；附件不能单独构成可发送消息，renderer 的按钮状态和 store 提交入口都必须拒绝仅附件提交。
- 补齐 Main 对 attachment 保存与读取请求的 Workspace sender 与 Session 归属校验，继续遵守现有 Session-scoped opaque handle 契约。

## Capabilities

### New Capabilities

- `chat-message-submission`: 定义 Chat 消息的必填 text 契约、草稿附件生命周期、首次 Session 创建/标题/ready probe 提升顺序、已有 Session 附件归属及失败回滚行为。

### Modified Capabilities

无。

## Impact

- Renderer：`src/renderer/src/composables/useChatAttachment.ts`、`src/renderer/src/composables/useChatPrompt.ts`、`src/renderer/src/components/chat/prompt/ChatPromptPanel.vue`、`src/renderer/src/stores/session/chat.ts`、`src/renderer/src/stores/session/session.ts` 及附件 view model/辅助类型。
- Main：`src/main/ipc/session/chat.ts` 对 attachment 保存与读取请求补充 sender scope 和 Session ownership 校验；继续复用 `src/main/services/session/chat/chat-service.ts` 与现有 attachment store。
- 测试：补充草稿态多附件、单附件后继续选择、必填 text、标题生成、probe 提升、统一 attachment owner、失败回滚和 Main attachment 授权测试。
- 不改变 persisted Session/Message schema、opaque `attachmentId` 结构、附件存储目录、ACP prompt part contract 或已有 Session 的正常发送行为。
