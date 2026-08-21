## Context

当前 `ChatPromptPanel.vue` 通过 `PromptActionMenu.vue` 把菜单选出的 `File[]` 交给 `useChatAttachment()`。该 composable 负责本地预览、草稿附件保存、已有 Session 的固定 target、opaque attachment handle 和预览资源清理；`chat-prompt-attachment.ts` 中的 `isImageAttachmentFile()` 已经定义了图片分类语义。三种输入统一使用 `src/renderer/src/composables/useChatAttachment.ts` 中唯一的 batch 契约：`export type ChatAttachmentInputRejectionReason = "directory"`，`export type ChatAttachmentInputBatch = { files: File[]; preRejected?: Array<{ reason: ChatAttachmentInputRejectionReason; count: number }> }`，以及 `handleAttachmentInput(batch: ChatAttachmentInputBatch)`。`getPromptCapabilities()` 继续提供 `image`、`audio` 和 `embeddedContext` 三个布尔值，不能为新输入入口另造一套能力来源。

本变更只增加 ChatPrompt surface 的两个输入来源：剪贴板中的图片和包含文件的拖放。普通文本粘贴、文本拖动、目录递归读取、Session 创建、IPC/持久化格式和 `chat-composer` feature 迁移都不在范围内。所有新来源最终必须落入既有附件生命周期，才能继续满足 `chat-message-submission` 对草稿、Session 归属、发送顺序和失败回滚的约束。

## Goals / Non-Goals

### Goals

- 让支持图片的 Agent 可以从 ChatPrompt 直接粘贴剪贴板图片，并生成与菜单上传相同的本地预览；paste handler 永远不调用 `preventDefault()`，混合剪贴板中的 `text/plain` 仍由浏览器插入。
- 让用户把图片或普通文件拖入 ChatPrompt；只拦截文件拖放，保留文本粘贴和文本拖动的原生行为。
- 让菜单选择、图片粘贴和文件拖放共享 `handleAttachmentInput(batch: ChatAttachmentInputBatch)` 的接收、`isImageAttachmentFile()` 分类、capability 校验、顺序和反馈路径。
- 在混合批次中只添加受支持项，以一次汇总反馈报告被拒绝项；目录在首版明确拒绝且不递归读取。
- 在 ChatPrompt surface 内提供可见、低干扰的拖拽命中状态，并在离开、放下或组件卸载后可靠清理。
- 保持现有 `chat-message-submission` 的 draft/Session 物化、opaque handle、仅附件不可发送、失败回滚和预览清理契约。

### Non-Goals

- 不修改 Main、IPC、preload、持久化 schema、ACP prompt part 或附件目录格式。
- 不把剪贴板文本转换为附件，不改变文本粘贴的默认插入行为，也不实现文本拖动的自定义排序。
- 不递归读取或压缩目录，不增加任意文件格式白名单，不引入新的第三方依赖。
- 不创建全页面拖拽 overlay，不使用几何变换、阴影动画或新的视觉 token。
- 不把实现迁移到 `src/renderer/src/features/chat-composer/`；该目录仍保持 README-only 的未来方向。

## Decisions

### 1. 以固定 batch 契约统一三种来源

`src/renderer/src/composables/useChatAttachment.ts` 是输入 batch 类型的唯一归属，并导出以下确定契约：

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

该 composable 对外提供 `handleAttachmentInput(batch: ChatAttachmentInputBatch): void`。`PromptActionMenu.vue` 的 `select-files` 事件只发送 `{ files: File[] }`；`ChatPromptPanel.vue` 的 paste 适配只发送 `{ files: imageFiles }`；drop 适配固定发送 `{ files, preRejected: directoryCount ? [{ reason: "directory", count: directoryCount }] : [] }`。组件只负责构造 batch，不负责 capability 拒绝计数或文案。

`handleAttachmentInput()` 先按输入顺序处理 `batch.files`，用 `isImageAttachmentFile()` 分类，再分别检查 `promptCapabilities.image` 与 `promptCapabilities.embeddedContext`，最后才调用 `createChatPromptAttachment()` 并登记 `File` 引用。该函数在内部派生图片/文件 capability 拒绝计数，将其与 `batch.preRejected` 合并为一次汇总 toast；接受项天然保持相对输入顺序。

替代方案是保留 `handleAttachmentSelect(files)` 并让三个来源分别传入额外信息，或为每个来源各写一个 handler。那会留下不明确的来源契约、重复实现 target/资源生命周期，并可能让不支持的文件先进入预览，因此不采用。

### 2. paste handler 永远保留浏览器默认文本插入

`ChatPromptPanel.vue` 的 paste handler 必须在所有分支都不调用 `preventDefault()`。它按 `ClipboardEvent.clipboardData.items` 原顺序检查：只有 `kind === "file"` 且 `getAsFile()` 返回 `File`、并且 `isImageAttachmentFile(file)` 为 true 的项目才加入 `imageFiles`；其他项目不改变浏览器默认行为。得到图片时调用 `handleAttachmentInput({ files: imageFiles })`，没有图片时不调用附件入口。

因此纯文本粘贴继续由 `UChatPrompt` 插入；文本与图片混合粘贴时，图片进入附件 capability 校验，`text/plain` 仍由浏览器插入；纯图片粘贴没有 `text/plain`，textarea 中不会产生可见文本。即使 `promptCapabilities.image` 为 false，`handleAttachmentInput()` 也只拒绝图片并产生一次反馈，不能阻止同一事件中的文本插入。

替代方案是发现图片后调用 `preventDefault()`，以阻止浏览器尝试插入图片。该方案会在混合剪贴板中同时吞掉 `text/plain`，违背文本输入不受影响的要求，因此不采用；纯图片没有可见文本的事实由 textarea 的原生行为自然满足。

### 3. drop 以确定的 `DataTransferItem` 算法构造 batch

drop 只在 `dataTransfer.types` 包含 `Files` 时进入文件处理。处理器按 `dataTransfer.items` 的原始顺序逐项执行：`kind !== "file"` 的项目忽略；`kind === "file"` 且 `webkitGetAsEntry()?.isDirectory === true` 时令 `directoryCount += 1` 并跳过；其他 `kind === "file"` 项目调用 `getAsFile()`，返回 `File` 才追加到 `files`，返回 null 则安全忽略。处理后调用 `handleAttachmentInput({ files, preRejected: directoryCount ? [{ reason: "directory", count: directoryCount }] : [] })`，因此去掉目录后仍保持文件相对顺序。

文件拖动时 `dragover` / `drop` 可以阻止默认行为以允许放下；不包含 `Files` 的文本拖动不调用 `preventDefault()`。首版不遍历 `FileSystemEntry`，不从目录名称伪造 `File`。

替代方案是依赖 `DataTransfer.files` 自动过滤目录，或将目录递归展开。前者无法可靠提供目录拒绝计数和跨平台语义，后者扩大权限、大小和资源清理范围，均不采用。

### 4. capability 拒绝只在共享入口派生并汇总

`handleAttachmentInput()` 是 capability 拒绝的唯一判定和文案来源。它把 `batch.files` 中的图片按 `promptCapabilities.image` 判定，把非图片文件按 `promptCapabilities.embeddedContext` 判定；拒绝项不创建预览、附件 ID 或保存请求。它再把这些内部计数与 `preRejected` 的目录计数合并成一条 toast，按原因说明图片、文件或目录被拒绝；组件不得为 capability 生成 toast 或复制原因文案。保存失败仍沿用现有附件保存错误处理，不与 capability 拒绝混为新的 IPC 路径。

替代方案是由 ChatPromptPanel 先检查 capability 或为每个文件分别 toast。前者会让菜单、paste、drop 产生三套规则，后者会造成反馈噪音，均不采用。

### 5. 拖拽状态是 ChatPrompt 的局部 UI 状态

`ChatPromptPanel.vue` 维护数值型 `dragDepth` 局部状态，并将状态 class 绑定到现有 ChatPrompt shell / `UChatPrompt` surface。命中时使用 `border-primary/40 bg-primary/5 transition-colors duration-150`；不增加 overlay、transform 或 shadow 动画。`dragDepth` 在 `drop`、有效 dragleave、`dragend`/取消和组件卸载时归零，同时保留已有 focus-visible 行为。

替代方案是使用全页面半透明层或通过 `hover:scale-*`、`shadow-*` 强化命中感。它们会遮挡其他工作区内容或违反既有 UI 动效约定，因此不采用。

### 6. 新输入只复用既有物化和提交契约

粘贴或拖放被接受后只产生本地附件草稿；没有 active Session 时不得调用 `saveAttachment` 或创建 Session。已有 Session 的选择仍由 `handleAttachmentInput()` 在接收时固定 `workspaceId/sessionId`，提交时通过现有 `materializeAttachmentParts(target)` 生成 opaque handle parts。文本仍是唯一可发送条件，附件顺序、失败回滚、`clearAttachments()` 和预览 URL 清理不变。

替代方案是新入口直接调用 Main 保存接口，或为粘贴/拖放建立独立的附件队列。那会绕过既有 target 固定和 draft promotion 顺序，扩大跨进程契约，故不采用。

## Risks / Trade-offs

- **浏览器剪贴板兼容性**：某些平台可能不给出可读取的图片 `File`。处理器应安全忽略无法转换的 item，不影响文本粘贴；能力支持只在实际得到文件时生效。
- **拖拽事件抖动**：surface 内部子元素会产生多次 `dragenter` / `dragleave`。使用已定义的 `dragDepth` 计数，在计数归零时清除状态；`drop` 和卸载仍作为强制清理边界。
- **混合批次反馈长度**：文件名很多时不逐个列举，按图片/文件/目录原因汇总数量，保证一次 toast 仍能说明发生了什么和如何处理。
- **能力变化竞态**：拖拽开始后 Agent 能力可能刷新。接收入口按处理时的最新 `promptCapabilities` 再校验，拒绝项不产生预览；已有物化和 Session scope 逻辑不变。
- **文件顺序与重复名称**：不以文件名去重，继续使用现有本地附件 ID 和输入顺序；相同名称文件仍可作为不同附件，opaque handle 由既有保存流程生成。
- **目录行为预期**：目录拖入不会显示其子文件，明确反馈“暂不支持目录”；未来若支持递归读取，应另立变更评估权限、大小和资源清理边界。
