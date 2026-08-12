## 1. 调整会话分组布局

- [x] 1.1 修改 `src/renderer/src/components/chat/ChatSidebar.vue` 的 `UCollapsible` 布局 class 绑定：在置顶与最近组同时展开时，让 `pinned` 组按内容自然收缩并以会话列表高度的 50% 为上限，让 `recent` 组保持 `min-h-0` 且增长填充剩余空间；复用现有 `groupOpenById`、`sessionGroups`、内部 `overflow-y-auto` 和 `unmount-on-hide="false"`，不得引入 DOM 高度测量。
- [x] 1.2 保留 `ChatSidebar.vue` 的单组布局与折叠语义：只有一个非空组、另一个组折叠或仅一个组展开时，展开组占用标题之外全部剩余高度；折叠组只保留标题，且 `transition-[flex-grow]` 与 `motion-reduce:transition-none` 行为不变。

## 2. 更新组件测试

- [x] 2.1 修改 `test/renderer/src/components/chat-sidebar.spec.ts` 中固定等分高度的断言，验证两组同时展开时置顶组具有 50% 最大高度且不增长、最近组增长填充剩余空间，并验证两个组的内部滚动容器仍使用 `overflow-y-auto`。
- [x] 2.2 在 `test/renderer/src/components/chat-sidebar.spec.ts` 覆盖最近组折叠、置顶组折叠和只有最近组三种状态，断言唯一展开组增长填满剩余空间，同时保留既有独立折叠、内容保持挂载和 active Session 自动展开测试。

## 3. 验证

- [x] 3.1 若当前 worktree 尚未准备，先运行 `sh scripts/prepare-worktree-env.sh`；随后运行 `pnpm exec vitest run --project renderer test/renderer/src/components/chat-sidebar.spec.ts` 和 `pnpm typecheck:web`，确认聚焦测试与 renderer 类型检查通过；不运行未经用户明确授权的 `pnpm build`。
- [x] 3.2 在浅色与深色主题、窄窗口与桌面窗口下人工检查：少量置顶会话按实际高度展示，大量置顶会话在 50% 上限内独立滚动，最近会话使用剩余空间，折叠与重新展开后滚动位置和可见焦点保持正常。
