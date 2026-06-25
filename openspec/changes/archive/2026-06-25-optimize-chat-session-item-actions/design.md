## Context

当前 `SessionItem.vue` 的更多操作菜单包含“重命名”和“删除”两个选项，但实际行为分别调用浏览器原生 `prompt("Rename session:", ...)` 和 `confirm("Are you sure...")`。这绕过了 renderer 规范中对简单确认弹窗的要求，也会让桌面应用出现不一致的系统级浏览器弹窗。

`useSessionStore` 已提供 `renameSession(sessionId, title)` 和 `deleteSession(sessionId)`，并通过现有 `chat:updateSession` / `chat:removeSession` IPC 同步磁盘。此次不需要新增 IPC、共享类型或持久化字段，只需要完善 `SessionItem.vue` 的交互和测试。

当前标题容器使用 `pr-8` 为绝对定位的三点按钮永久让位。按钮默认不可见，导致非 hover 状态下右侧出现空白，窄侧栏中标题只能显示较短内容。

## Goals / Non-Goals

**Goals:**

- 使用“修改标题”作为菜单文案，明确用户编辑的是 session 的展示标题。
- 删除会话使用 `useConfirmDialog()`，确认后才调用 `useSessionStore.deleteSession()`。
- 修改标题使用应用内 UI，不再调用 `window.prompt`。
- 正常状态下移除标题区域的永久右侧留白，提高可见标题长度。
- 通过 `test/renderer/src/components/session-item.spec.ts` 覆盖主要交互分支。

**Non-Goals:**

- 不新增或修改 chat IPC channel。
- 不改变 session 标题的持久化格式、排序规则、agent 自动标题覆盖逻辑或删除文件语义。
- 不调整 Chat sidebar 宽度。
- 不引入新的全局弹窗组件或更新 `useConfirmDialog()` 契约。
- 不更新 repository guidelines；现有 `RendererProcess.md`、`UiDesign.md` 和 `Testing.md` 已覆盖本次确认弹窗、布局和测试约束。

## Decisions

### 1. 菜单文案使用“修改标题”

采用“修改标题”而不是“重命名”。Session 的 `title` 是可由用户编辑、也可由 agent 的 `session_info_update` 覆盖的展示字段，不是不可变资源名或文件名。“修改标题”比“重命名”更贴近当前对象和行为。

备选方案“重命名”更短，但容易暗示资源名或 session 标识发生变化。实际实现只调用 `renameSession(sessionId, title)` 更新标题字段，不改 `sessionId`。

### 2. 修改标题采用 session item 内就地编辑

选择在当前 session item 内进入编辑态，而不是打开确认弹窗或继续使用 `prompt`。菜单选择“修改标题”后，标题行切换为输入框，输入框默认填入当前标题并获得焦点；按 Enter 或 blur 提交，按 Escape 取消。提交前对输入执行 `trim()`：

- trim 后为空时退出编辑态且不调用 `renameSession`。
- trim 后与当前标题一致时退出编辑态且不调用 `renameSession`。
- trim 后有效且不同于当前标题时调用 `useSessionStore.renameSession(session.id, trimmedTitle)`。

这个方案让编辑对象与编辑位置保持一致，避免为了单字段文本输入新增复杂 modal。实现时需要阻止编辑区点击冒泡，避免触发 session 选择。

### 3. 删除确认复用 `useConfirmDialog()`

删除是简单二选一危险操作，符合 `RendererProcess.md` 对 `useConfirmDialog()` 的适用范围。`SessionItem.vue` 应在 `handleDelete()` 中调用：

- `title`: `删除会话？`
- `description`: 包含当前 session 标题，并说明会话将从历史记录中永久删除且不可撤销
- `confirmLabel`: `删除会话`
- `confirmColor`: `error`

当 Promise resolve 为 `true` 时调用 `sessionStore.deleteSession(session.id)`；resolve 为 `false` 时直接返回。

### 4. 标题区域不再为隐藏按钮永久让位

移除内容容器上的固定 `pr-8`。更多操作按钮继续绝对定位在右上角，但只在 `group-hover`、`group-focus-within` 或 dropdown 打开时显示。按钮显示时可通过自身背景或局部渐隐遮住标题末端，确保按钮可读可点；正常状态下标题行应使用完整剩余宽度。

如 `UDropdownMenu` 支持 `v-model:open` 或 `@update:open`，组件应跟踪 `menuOpen`，在菜单打开时保持按钮可见。若实际 Nuxt UI 版本只依赖 focus-within，也要确保菜单打开期间按钮不会立即消失。

## Risks / Trade-offs

- 就地编辑态与条目点击选择可能冲突 -> 输入框容器和菜单按钮必须使用 `@click.stop`，键盘提交也要阻止默认行为。
- blur 自动提交可能在用户点击 Escape 或菜单按钮时产生竞态 -> 实现应让 `cancelTitleEdit()` 标记取消态，或保证 Escape 分支不会再提交同一次编辑。
- 删除确认文案包含长标题时可能过长 -> 描述中可截断或依赖确认弹窗文本换行，但确认按钮必须保持 `删除会话`。
- 按钮 overlay 可能遮住标题尾部 -> 这是可接受取舍，因为按钮只在用户与条目交互时出现；正常浏览列表时标题可见长度应优先。
