## 1. 会话分组状态与投影

- [x] 1.1 修改 `src/renderer/src/components/chat/ChatSidebar.vue`，新增局部 `SessionGroupId`、`SessionGroup`、`groupOpenById` 和 `sessionGroups`：按 `pinned`、`recent` 稳定顺序生成非空分组，保留现有 `updatedAt` 降序排序，并让两个分组的初始展开状态均为 `true`。
- [x] 1.2 在 `ChatSidebar.vue` 中从 `sessionStore.activeSession` 派生 `activeGroupId` 并监听分组 ID 转换；当 active 会话从无或其他分组进入目标组时只将目标组设为展开，不修改其他分组，并确保非 active 会话置顶或取消置顶不会触发展开。

## 2. 可折叠分组界面

- [x] 2.1 将 `ChatSidebar.vue` 的固定双分组模板替换为按 `sessionGroups` 渲染的 `UCollapsible as="section"`；通过 `v-model:open` 连接 `groupOpenById`，显式设置 `:unmount-on-hide="false"`，并使用 Nuxt UI 按钮作为 trigger，展示分组图标、中文标签、会话数量和反映展开状态的 chevron。
- [x] 2.2 为 `UCollapsible` 根节点、content 和内部列表配置 flex/overflow 类：根节点以标题高度作为固定 `flex-basis`，打开组使用 `flex-grow: 1`，关闭组使用 `flex-grow: 0`，并以短 `flex-grow` 过渡替代 Nuxt UI 默认 content 高度动画；content 使用 `flex min-h-0 flex-1 flex-col overflow-hidden`，列表使用 `min-h-0 flex-1 overflow-y-auto`；验收两组展开时等分剩余高度、单组折叠时另一组撑满、全部折叠时标题按置顶到最近的顺序自然排列。
- [x] 2.3 移除“无置顶会话时渲染无标题普通列表”的特殊分支，使唯一的最近会话组仍显示可折叠标题和数量，同时继续隐藏空的置顶组并保留现有空侧栏 `AppEmptyState`。

## 3. Renderer 组件测试

- [x] 3.1 修改 `test/renderer/src/setup.ts`，为 `UCollapsible` 和 `Collapsible` 注册有意义的交互 stub：支持 `open`/`defaultOpen`、`update:open`、默认 trigger slot、content slot 和 `unmountOnHide=false` 下内容保持挂载，避免测试依赖 Nuxt UI 内部实现。
- [x] 3.2 扩展 `test/renderer/src/components/chat-sidebar.spec.ts` 的 session store mock，暴露可变 `activeSession`，并更新现有断言以覆盖最近组单独显示标题、两个分组默认展开、标题数量、独立滚动及打开/关闭组的 flex 类。
- [x] 3.3 在 `chat-sidebar.spec.ts` 增加交互测试：手动折叠一个组不改变另一个组；active 会话进入折叠目标组时只展开目标组；手动折叠 active 所在组后在 active 分组不变时保持折叠；非 active 会话跨组移动时目标组保持折叠；折叠后 content 仍保持挂载。

## 4. 验证

- [x] 4.1 在该变更 worktree 首次运行项目命令前执行 `sh scripts/prepare-worktree-env.sh`，然后运行 `pnpm exec vitest run --project renderer test/renderer/src/components/chat-sidebar.spec.ts`，确认折叠状态和 active 分组转换测试通过。
- [x] 4.2 运行 `pnpm typecheck:web` 和 `pnpm lint`，修复本变更引入的类型、Vue 模板、ESLint 或格式问题。
- [x] 4.3 人工检查浅色/深色主题及窄窗口：验证两组展开的等分高度、任一组折叠后的剩余空间分配、全部折叠的自然顺序、可见焦点、键盘触发、chevron 状态和独立滚动。
