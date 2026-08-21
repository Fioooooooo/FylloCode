# chat-message-submission Specification

## Purpose

定义 Renderer 用户消息提交与附件物化的行为边界：消息必须包含非空用户 text，草稿附件仅在真实 Session 创建后持久化，并在首条消息 durable append 成功后激活 Session；Main 负责校验附件所属的 Workspace 与 Session。

## Requirements

### Requirement: 每次用户消息必须包含非空 text

Renderer SHALL 仅允许提交至少包含一个 trim 后非空、且不是 system reminder 的 `text` part 的用户消息。图片、文件、附件名称、附件摘要、system reminder 或其他非 text prompt part SHALL NOT 替代用户 text。提交按钮状态、组件提交 handler 与 Chat store 提交入口 SHALL 执行一致的拒绝规则。

#### Scenario: text 与附件一起发送

- **WHEN** 用户输入 trim 后非空的 text，并选择零个或多个当前 Agent 支持的附件
- **THEN** Renderer SHALL 允许提交消息
- **AND** 附件 SHALL 作为该 text 消息的可选附加 parts 发送

#### Scenario: 仅附件消息

- **WHEN** 用户未输入 text 或 text trim 后为空，但已选择一个或多个附件
- **THEN** Renderer SHALL 禁用提交操作
- **AND** 组件 handler 与 Chat store SHALL 在任何 Session 创建、消息持久化或 ACP prompt 前拒绝提交

#### Scenario: system reminder 不能替代用户 text

- **WHEN** prompt parts 只包含 system reminder text 和附件，不包含 trim 后非空的用户 text
- **THEN** Chat store SHALL 拒绝提交

#### Scenario: 非组件调用绕过按钮状态

- **WHEN** 任务联动或其他 renderer 调用方直接请求发送不含非空用户 text 的 prompt parts
- **THEN** Chat store SHALL 拒绝请求
- **AND** SHALL NOT 创建 Session、追加 Message 或启动 stream

### Requirement: 草稿附件选择不创建 Session

没有 active Session 时，Renderer SHALL 把用户选择的图片或文件保留为当前 prompt 的本地草稿和预览，SHALL NOT 因附件选择而创建、持久化、展示或激活 Session，亦 SHALL NOT 在真实 Session 创建前调用 Session-scoped attachment 保存接口。

#### Scenario: ready probe 后一次选择多个文件

- **WHEN** draft probe 已 ready、active Session 为空，且用户一次选择 X 个图片或文件
- **THEN** 左侧 Session 列表和 active Session SHALL 保持不变
- **AND** Renderer SHALL NOT 发起任何 `createSession` 或 `saveAttachment` 请求
- **AND** X 个本地附件 SHALL 按选择顺序出现在 prompt 预览中

#### Scenario: 草稿态分两次选择附件

- **WHEN** 用户在同一草稿 prompt 中先选择一个文件，随后再次选择一个或多个文件
- **THEN** 全部附件 SHALL 继续属于同一个未提交 prompt
- **AND** 每次选择都 SHALL NOT 创建或激活 Session

#### Scenario: 删除草稿附件

- **WHEN** 用户在提交前移除一个附件或离开当前 prompt
- **THEN** Renderer SHALL 释放该附件的本地预览资源
- **AND** Main SHALL 不存在需要清理的 Session attachment copy

### Requirement: 首次提交按唯一 Session 顺序物化附件

草稿 prompt 首次提交时，Renderer SHALL 先从非空用户 text 生成标题并创建唯一真实 Session，再把该 prompt 的所有附件持久化到创建结果返回的同一 `workspaceId/sessionId`。全部附件成功后，Renderer SHALL 先持久化首条 user message，再把 Session 加入列表并设为 active，最后启动 ACP prompt。首次提交 SHALL NOT 使用 renderer 的可变 active Session 状态重新决定附件 owner。首条消息 durable append 成功后，Renderer SHALL 将当前 URL 切换到新建会话的 `/chat/:sessionId` 子路由。

Session fallback title SHALL 优先提取用户 text 中的 `**标题**:` 行；不存在结构化标题时 SHALL trim text、把连续空白归一化为单个空格，并截取前 30 个 Unicode code point。

#### Scenario: ready probe 首发携带多个附件

- **WHEN** ready probe 后用户以非空 text 和多个附件提交首条消息
- **THEN** Renderer SHALL 只创建一个 Fyllo Session，并携带该 probe 的 `fylloSessionId`、`acpSessionId`、config options 与 available commands
- **AND** 每个附件 SHALL 在该创建请求成功后保存到返回的同一 Session ID
- **AND** 首条持久化 Message SHALL 按选择顺序保存所有 attachment handles
- **AND** ACP prompt SHALL 复用该 ready probe 的 ACP Session

#### Scenario: 首条消息生成 fallback title

- **WHEN** 用户以 `  hello\n\nworld   example  ` 作为首条 text 提交草稿
- **THEN** 新 Session 的初始标题 SHALL 为 `hello world example`
- **AND** 附件存在与否 SHALL NOT 使标题回退为 `New Session`

#### Scenario: 首条消息使用结构化标题

- **WHEN** 首条用户 text 包含 `**标题**: 修复附件会话竞态`
- **THEN** 新 Session 的初始标题 SHALL 优先使用 `修复附件会话竞态`
- **AND** 超过 30 个 Unicode code point 时 SHALL 截取前 30 个

#### Scenario: 无 ready probe 的正常首发

- **WHEN** 草稿没有可复用的 ready probe，但用户以非空 text 和附件提交首条消息
- **THEN** Renderer SHALL 创建一个普通 Session
- **AND** SHALL 在该真实 Session 创建成功后按相同顺序持久化附件、消息并启动 ACP prompt

#### Scenario: 持久化完成前 Session 不可见

- **WHEN** Main 已返回新 Session，但一个或多个附件保存或首条 Message durable append 尚未完成
- **THEN** Renderer SHALL NOT 把该 Session 加入左侧列表或设为 active
- **AND** SHALL 禁止同一 prompt 重复提交

#### Scenario: 首发成功后更新会话路由

- **WHEN** 草稿态首条消息创建的新 Session 已完成首条 user message durable append
- **THEN** Renderer SHALL 使用 replace 方式将当前 URL 切换到该 Session 的 `/chat/:sessionId`
- **AND** 浏览器历史栈 SHALL NOT 保留已消费的草稿态 `/chat` 入口
- **AND** 后续 streaming 与消息加载 SHALL 继续围绕该 Session 执行

### Requirement: 已有 Session 的附件保持当前归属

存在 active Session 时，Renderer SHALL 把新选择的附件保存到该 Session 的 attachment directory，并在后续消息中只提交该 Session 返回的 opaque handles。选择一个或多个附件 SHALL NOT 创建其他 Session或改变 active Session。

#### Scenario: 已有 Session 选择多个附件

- **WHEN** 用户在已有 active Session 中一次选择多个受支持文件
- **THEN** 所有 `saveAttachment` 请求 SHALL 使用该 active Session 的固定 `workspaceId/sessionId`
- **AND** Session 列表 SHALL 不增加新条目

#### Scenario: 已有 Session 分次选择附件

- **WHEN** 用户在已有 active Session 中先后多次选择附件并发送一条非空 text 消息
- **THEN** 所有 attachment handles SHALL 可由该 active Session 解析
- **AND** ACP prompt SHALL NOT 返回跨 Session attachment 错误

### Requirement: 首次提交失败不留下空 Session

首次提交在新 Session 创建、附件保存或首条 Message durable append 阶段失败时，Renderer SHALL 保持草稿态和用户输入，SHALL NOT 消费 ready probe，并 SHALL 删除本次创建的 Session及其已写入附件。迟到的异步结果或 Workspace/Agent/Session scope 变化 SHALL NOT 激活已取消的 Session。

#### Scenario: Session 创建失败

- **WHEN** 首次提交的 Session 创建请求失败
- **THEN** Session 列表与 active Session SHALL 保持不变
- **AND** text、附件预览与 ready probe SHALL 保留以供重试

#### Scenario: 部分附件保存后失败

- **WHEN** 同批附件中部分已保存，但后续附件保存失败
- **THEN** 系统 SHALL 删除刚创建的 Session及其全部 attachment copies
- **AND** Renderer SHALL 保留原始 text 和本地附件草稿
- **AND** 重试 SHALL 创建新的唯一 Session并重新上传全部附件

#### Scenario: 首条 Message 持久化失败

- **WHEN** 所有附件保存成功，但首条 user message durable append 失败
- **THEN** 系统 SHALL 删除刚创建的 Session及其 attachment copies
- **AND** SHALL NOT 启动 ACP prompt或清除 ready probe

#### Scenario: 提交期间 scope 变化

- **WHEN** 首次提交进行中用户切换 Workspace、Agent 或 active Session，或新的 draft run 取代旧 run
- **THEN** 旧提交的迟到结果 SHALL 被丢弃
- **AND** 旧提交创建的未提交 Session SHALL 被清理，SHALL NOT 覆盖当前 renderer 状态

### Requirement: 首次提交固定并校验 draft 会话模式

草稿 prompt首次提交时，Renderer SHALL在开始提交前捕获当前 `sessionMode`，并 SHALL使用该快照创建唯一真实 Session、选择可提升 probe和执行全部 scope校验。Session创建、附件物化、首条 Message durable append或激活完成前模式发生变化时，旧提交 SHALL失效并沿用现有未提交 Session清理语义；迟到结果 SHALL NOT覆盖当前 draft。

#### Scenario: 首发持久化当前模式

- **WHEN** 用户以非空 text在 `native` draft提交首条消息
- **THEN** createSession请求 SHALL携带 `native`
- **AND** 返回的 Session SHALL持久化并投影 `native`

#### Scenario: Carry probe 模式匹配

- **WHEN** 首发前存在与当前 Workspace、Agent和 mode匹配的 ready probe
- **THEN** Renderer SHALL只携带该 probe的 ACP session与配置创建 Session
- **AND** Main SHALL在 promotion时再次验证 mode

#### Scenario: 提交期间模式变化

- **WHEN** Session创建、附件保存或首条 Message durable append期间 `draftSessionMode`变化
- **THEN** 旧提交 SHALL被视为 scope changed
- **AND** 已创建的未提交 Session及其 attachment copies SHALL被删除
- **AND** 用户输入和本地附件草稿 SHALL保留以供新模式重试

#### Scenario: 迟到 probe 使用旧模式

- **WHEN** 旧模式 probe update在用户已切换到新模式后到达 Renderer
- **THEN** Renderer SHALL忽略该 update
- **AND** SHALL NOT把旧 probe用于新模式首次提交

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
