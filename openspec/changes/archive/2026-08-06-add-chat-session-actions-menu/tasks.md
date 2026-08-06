## 1. Renderer 组件与 Header 集成

- [x] 1.1 新建 `src/renderer/src/components/chat/ChatSessionActionsMenu.vue`：声明必填 `sessionId: string` prop，使用 `UDropdownMenu` 与 `DropdownMenuItem[]` 提供“复制会话 ID”菜单项，使用 neutral/ghost/sm 的 `more-vertical` icon button 作为带 `title`、`aria-label="会话操作"` 的触发器，并添加稳定的 `data-test` 属性供交互测试定位。
- [x] 1.2 在 `ChatSessionActionsMenu.vue` 中实现复制处理：选择菜单项时调用 `navigator.clipboard.writeText(props.sessionId)`；成功通过 `useToast()` 显示 `{ title: "会话 ID 已复制", color: "success" }`；失败显示 `{ title: "会话 ID 复制失败", description: <错误消息>, color: "error" }`，且不缓存 prop 或引用 ACP session ID。
- [x] 1.3 修改 `src/renderer/src/components/chat/ChatContainer.vue`：导入 `ChatSessionActionsMenu`，在 `data-test="chat-header-right-actions"` 内、现有 `SessionScopePopover` 之后使用 `v-if="activeSession"` 挂载并传入 `:session-id="activeSession.id"`；保持 draft/无 active Session 时隐藏入口，并保持现有三栏宽度和 `gap-1`。

## 2. Renderer 回归测试

- [x] 2.1 扩展 `test/renderer/src/components/chat-container.spec.ts`，使用现有全局 `UDropdownMenu`/`UButton` 测试桩，断言 draft 或 `activeSession` 不存在时不显示“会话操作”，会话建立后入口出现在 `SessionScopePopover` 之后，并具备预期 `aria-label` 与菜单项文案。
- [x] 2.2 在同一测试文件中 mock `navigator.clipboard.writeText` 和 `useToast()` 返回对象，覆盖复制当前 `activeSession.id`、切换 active Session 后复制新 ID、成功 toast，以及 rejection 时包含错误原因的 error toast；测试只验证组件行为，不验证 Nuxt UI 内部实现。

## 3. 验证

- [x] 3.1 运行 `pnpm exec vitest run --project renderer test/renderer/src/components/chat-container.spec.ts`，确认新增交互和既有 ChatContainer 行为全部通过。
- [x] 3.2 运行 `pnpm typecheck:web` 与 `pnpm lint`，并执行 `git diff --check`；人工检查浅色/深色主题以及窄窗口/桌面窗口下的菜单定位、键盘焦点和 Header 无横向溢出。
