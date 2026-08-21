## ADDED Requirements

### Requirement: ChatPrompt SHALL 接收图片并始终保留剪贴板文本

ChatPrompt 的 paste handler MUST 在所有分支都不调用 `preventDefault()`。handler SHALL 按 `ClipboardEvent.clipboardData.items` 原顺序提取 `kind === "file"` 且 `getAsFile()` 返回 `File`、并经 `isImageAttachmentFile()` 判定为图片的项目，调用 `handleAttachmentInput({ files: imageFiles })`；剪贴板中的 `text/plain` SHALL 始终交给浏览器原生插入。纯图片剪贴板在 textarea 中不会产生可见文本。

#### Scenario: 支持图片的 Agent 粘贴纯图片

- **WHEN** 当前 Agent 的 `promptCapabilities.image` 为 true，且用户在 ChatPrompt 中粘贴包含图片 `File` 但不含 `text/plain` 的剪贴板内容
- **THEN** paste handler SHALL 不调用 `preventDefault()`
- **AND** SHALL 调用 `handleAttachmentInput({ files: imageFiles })`
- **AND** SHALL 生成与菜单上传一致的本地图片预览
- **AND** textarea SHALL 不产生可见的图片文本

#### Scenario: 普通文本粘贴保持原生行为

- **WHEN** 用户粘贴内容只包含 `text/plain` 而不包含图片 `File`
- **THEN** ChatPrompt SHALL 不调用 `preventDefault()`
- **AND** SHALL 不调用 `handleAttachmentInput()`
- **AND** `UChatPrompt` SHALL 继续执行原生文本插入
- **AND** SHALL 不创建附件或显示附件拒绝反馈

#### Scenario: 支持图片的文本与图片混合粘贴

- **WHEN** 当前 Agent 的 `promptCapabilities.image` 为 true，且剪贴板同时包含 `text/plain` 与图片 `File`
- **THEN** paste handler SHALL 不调用 `preventDefault()`
- **AND** SHALL 以 `{ files: imageFiles }` 调用 `handleAttachmentInput()` 并生成图片预览
- **AND** 浏览器 SHALL 继续把 `text/plain` 插入 ChatPrompt 的文本输入

#### Scenario: 不支持图片的文本与图片混合粘贴

- **WHEN** 当前 Agent 的 `promptCapabilities.image` 为 false，且剪贴板同时包含 `text/plain` 与图片 `File`
- **THEN** paste handler SHALL 不调用 `preventDefault()`
- **AND** `handleAttachmentInput()` SHALL 拒绝图片且不创建预览、附件 ID 或保存请求
- **AND** 系统 SHALL 产生一次明确的图片 capability 拒绝反馈
- **AND** 浏览器 SHALL 继续把 `text/plain` 插入 ChatPrompt 的文本输入

### Requirement: ChatPrompt SHALL 只拦截文件拖放并提供局部命中反馈

ChatPrompt surface MUST 识别 `DataTransfer` 中包含文件的拖放，图片和普通文件 SHALL 进入 `handleAttachmentInput()`；文本拖动 SHALL 保持原生行为。拖拽命中状态 SHALL 只作用于 ChatPrompt surface，并使用现有 Nuxt UI/Tailwind 语义背景、边界或颜色表达，不得创建全页面 overlay、几何变换或阴影动画。

#### Scenario: 图片和普通文件混合拖放

- **WHEN** 用户把包含图片和普通文件的批次拖入 ChatPrompt surface 并放下
- **THEN** 文件拖放事件 SHALL 只在 ChatPrompt surface 内被拦截
- **AND** SHALL 以 `{ files, preRejected: directoryCount ? [{ reason: "directory", count: directoryCount }] : [] }` 调用 `handleAttachmentInput()`
- **AND** 受支持的图片与普通文件 SHALL 按输入顺序加入附件预览
- **AND** 拖放完成后 ChatPrompt 的命中反馈状态 SHALL 被清除

#### Scenario: 文本拖动保持原生行为

- **WHEN** 用户拖动不包含 `Files` 类型的普通文本到 ChatPrompt
- **THEN** ChatPrompt SHALL 不调用 `preventDefault()`
- **AND** SHALL 不调用 `handleAttachmentInput()`
- **AND** SHALL 不创建附件或显示文件拖拽命中状态

#### Scenario: DataTransferItem 目录与空文件安全处理

- **WHEN** 文件拖放的 `dataTransfer.items` 按顺序包含目录项目、返回 `File` 的文件项目和 `getAsFile()` 返回 null 的文件项目
- **THEN** `kind !== "file"` 的项目 SHALL 被忽略
- **AND** `kind === "file"` 且 `webkitGetAsEntry()?.isDirectory === true` 的项目 SHALL 只使 `directoryCount` 加一并进入 `preRejected`
- **AND** 其他 `kind === "file"` 项目只有在 `getAsFile()` 返回 `File` 时才加入 `files`，null SHALL 被安全忽略
- **AND** `files` SHALL 保持去掉目录后的原始相对顺序，且首版 SHALL 不递归读取目录

#### Scenario: 拖拽状态在离开或取消后清理

- **WHEN** 文件拖动离开 ChatPrompt、完成放下、拖拽被取消或 ChatPrompt 组件卸载
- **THEN** ChatPrompt 的局部 `dragDepth` 命中状态 SHALL 归零
- **AND** SHALL 不在页面其他区域保留 overlay、边界或背景反馈

### Requirement: 三种附件来源 SHALL 使用固定 batch 契约和共享 capability 校验

`src/renderer/src/composables/useChatAttachment.ts` MUST 是输入类型的唯一归属，并 SHALL 导出以下契约：

```ts
export type ChatAttachmentInputRejectionReason = "directory";
export type ChatAttachmentInputBatch = {
  files: File[];
  preRejected?: Array<{
    reason: ChatAttachmentInputRejectionReason;
    count: number;
  }>;
};
```

该模块 SHALL 提供 `handleAttachmentInput(batch: ChatAttachmentInputBatch): void`。`PromptActionMenu` 的 `select-files` SHALL 发送 `{ files }`，paste SHALL 发送 `{ files: imageFiles }`，drop SHALL 发送 `{ files, preRejected: directoryCount ? [{ reason: "directory", count: directoryCount }] : [] }`。capability 拒绝 SHALL 由 `handleAttachmentInput()` 内部按 `isImageAttachmentFile()` 派生，并与 `preRejected` 合并为一次反馈；组件 SHALL 不生成 capability 文案。

#### Scenario: 菜单选择使用 batch 适配

- **WHEN** 用户通过 `PromptActionMenu` 选择一个或多个文件
- **THEN** `select-files` 事件 SHALL 以 `{ files }` 形状发出
- **AND** `ChatPromptPanel` SHALL 原样调用 `handleAttachmentInput({ files })`
- **AND** 菜单 SHALL 不直接执行 capability 判断、toast 或附件保存

#### Scenario: 粘贴使用图片 batch 适配

- **WHEN** paste handler 提取到一个或多个图片 `File`
- **THEN** `ChatPromptPanel` SHALL 以 `{ files: imageFiles }` 调用 `handleAttachmentInput()`
- **AND** capability 拒绝计数与反馈 SHALL 只由 `handleAttachmentInput()` 产生

#### Scenario: 拖放使用目录预拒绝 batch 适配

- **WHEN** drop handler 完成 `DataTransferItem` 遍历并得到 `files` 与 `directoryCount`
- **THEN** `ChatPromptPanel` SHALL 以 `{ files, preRejected: directoryCount ? [{ reason: "directory", count: directoryCount }] : [] }` 调用 `handleAttachmentInput()`
- **AND** `handleAttachmentInput()` SHALL 合并目录计数与图片/文件 capability 拒绝计数
- **AND** 一个批次 SHALL 最多产生一次汇总反馈，且拒绝项 SHALL 不进入附件预览或保存

### Requirement: 新附件输入 SHALL 保持既有草稿、Session 和提交契约

通过粘贴或拖放接受的附件 MUST 继续使用既有 `chat-message-submission` 生命周期。没有 active Session 时，输入 SHALL 只保存本地草稿和预览；有 active Session 时，附件 SHALL 归属于输入时固定的 `workspaceId/sessionId`；附件仍不能替代非空用户 text，opaque handle、选择顺序、失败回滚和预览清理 SHALL 保持不变。

#### Scenario: 草稿态粘贴或拖放不创建 Session

- **WHEN** 当前没有 active Session，用户通过粘贴或拖放加入一个或多个受支持附件但尚未提交非空 text
- **THEN** Renderer SHALL 只保留本地附件草稿和预览
- **AND** SHALL 不创建或激活 Session
- **AND** SHALL 不调用 `saveAttachment`

#### Scenario: 已有 Session 保持固定归属

- **WHEN** 当前存在 active Session，用户通过粘贴或拖放加入附件，随后 active 状态或其他 renderer scope 发生变化
- **THEN** 新附件的保存请求 SHALL 继续使用接收时固定的 `workspaceId/sessionId`
- **AND** 提交的附件 SHALL 只包含该 Session 可解析的 opaque handles
- **AND** SHALL 不因新输入来源创建或切换到其他 Session

#### Scenario: 仅附件仍不可发送

- **WHEN** 用户已通过菜单、粘贴或拖放加入附件，但用户 text 为空或 trim 后为空
- **THEN** 提交操作 SHALL 保持禁用或被统一提交入口拒绝
- **AND** SHALL 不创建 Session、持久化 Message 或启动 ACP prompt
- **AND** 附件预览 SHALL 保留以便用户补充文本或移除附件
