## 1. SessionItem 交互实现

- [x] 1.1 修改 `src/renderer/src/components/chat/SessionItem.vue` 的菜单项：将 label 从 `重命名` 改为 `修改标题`，保留 `i-lucide-pencil` 图标，并让 `onSelect` 进入标题编辑态而不是调用 `window.prompt`。
- [x] 1.2 在 `SessionItem.vue` 中新增标题编辑状态与方法：`isEditingTitle`、`titleDraft`、`titleInputRef`、`startTitleEdit()`、`commitTitleEdit()`、`cancelTitleEdit()`；编辑态默认填入 `session.title`，输入框获得焦点并选中文本，Enter 或 blur 调用 `commitTitleEdit()`，Escape 调用 `cancelTitleEdit()`。
- [x] 1.3 在 `commitTitleEdit()` 中执行 `const trimmedTitle = titleDraft.trim()`；当结果为空或等于 `session.title` 时不调用 store，只退出编辑态；当结果有效且变化时调用 `sessionStore.renameSession(session.id, trimmedTitle)`。
- [x] 1.4 替换 `handleDelete()`：导入并调用 `useConfirmDialog()`，使用 `title: "删除会话？"`、`confirmLabel: "删除会话"`、`confirmColor: "error"`，仅当确认结果为 `true` 时调用 `sessionStore.deleteSession(session.id)`；删除 `window.confirm` 用法。
- [x] 1.5 确保编辑输入框、菜单按钮和 dropdown 内容使用 `@click.stop` 或等价方式阻止冒泡，不触发 `handleSelect()`；选择 session 的既有行为和后台 stream 不取消语义保持不变。

## 2. SessionItem 布局调整

- [x] 2.1 移除 `SessionItem.vue` 中标题内容容器的永久 `pr-8`，让非 hover / 非 focus / 菜单未打开状态下的 `data-test="session-title"` 使用完整剩余宽度。
- [x] 2.2 保持三点菜单按钮绝对定位在条目右上角，并仅在 `group-hover`、`group-focus-within` 或 dropdown 打开时可见；如果 Nuxt UI `UDropdownMenu` 支持 `v-model:open`，新增 `menuOpen` 状态以保证菜单打开期间按钮保持可见。
- [x] 2.3 给三点菜单触发按钮补充 `aria-label="会话操作"` 或等价可访问名称，并保持 icon-only 按钮的尺寸稳定。

## 3. 测试

- [x] 3.1 更新 `test/renderer/src/components/session-item.spec.ts`：移除对全局 `prompt` / `confirm` 的依赖，mock `@renderer/composables/useConfirmDialog` 返回可控的 `Promise<boolean>`。
- [x] 3.2 增加“修改标题”测试：点击 dropdown item 后显示标题输入框，提交变化后的标题会调用 `renameSession(sessionId, trimmedTitle)`。
- [x] 3.3 增加修改标题的空值、未变化和取消测试：空白输入、trim 后未变化标题、Escape 取消都不得调用 `renameSession`。
- [x] 3.4 增加删除测试：确认弹窗 resolve 为 `true` 时调用 `deleteSession(sessionId)`，resolve 为 `false` 时不调用。
- [x] 3.5 增加布局断言：session 标题内容容器不再包含永久 `pr-8`，菜单触发按钮仍存在并可通过 hover/focus 类显示。

## 4. 验证

- [x] 4.1 运行 `pnpm vitest run test/renderer/src/components/session-item.spec.ts`。
- [x] 4.2 运行 `pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`。
- [x] 4.3 运行 `pnpm typecheck:web`。
