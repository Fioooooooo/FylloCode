## 1. Session scope Popover 组件

- [x] 1.1 使用 `git mv` 将 `src/renderer/src/components/chat/SessionScopeHeader.vue` 重命名为 `SessionScopePopover.vue`；保留 `activeSession.workspaceSnapshot`、`activeSessionScopeDiff`、`workspaceKindLabel` 和 `snapshotFolderName` 的现有投影职责，新增受控 Popover open state，并确保没有 snapshot 时不渲染入口。
- [x] 1.2 在 `SessionScopePopover.vue` 中用项目现有 `ProjectHealthPopover.vue` 的 `UPopover` + `UTooltip` + `UButton` 模式替换 `<details>`：实现 Header 右侧 `i-lucide-folder-key` ghost icon button、约 380px 且受 viewport 约束的 Popover、“Agent 可访问的 Project”标题、数量/固定快照副标题、显式关闭按钮，以及点击外部/`Escape` 关闭和焦点返回入口；完成后可通过 tooltip、`aria-label` 与键盘焦点识别入口。
- [x] 1.3 在 `SessionScopePopover.vue` 中按 snapshot 原顺序实现单列 Project 列表，名称与项目目录使用 `min-w-0`/`truncate` 并以 `title` 暴露完整值；列表使用约 `max-h-72`、`overflow-y-auto`、`overscroll-contain` 且无横向滚动，primary 行显示 teal dot 与可见“主 Project”文字，16 个 Project 时只滚动列表区域。
- [x] 1.4 在 `SessionScopePopover.vue` 中按 `isStale` → `hasChanges` → normal 优先级实现 trigger 和 Popover 状态：差异与失效分别使用不同 warning/error icon shape、状态化 tooltip/`aria-label` 和可见文字 surface，复用 current-only、snapshot-only、primary、名称、路径和 unavailable 差异文案，并在底部说明 Session 授权范围固定；不得从当前 Workspace 列表替换 snapshot Project。

## 2. ChatContainer 装配

- [x] 2.1 修改 `src/renderer/src/components/chat/ChatContainer.vue`：导入并在 Header 右侧 `w-1/5` action container 中装配 `SessionScopePopover`，仅非 draft Session 显示；删除 Header 下方旧 `SessionScopeHeader` 常驻位置，保持左侧按钮、`OriginTaskBanner`、消息滚动区和 prompt footer 的布局及行为不变。
- [x] 2.2 全仓搜索并移除生产代码中的 `SessionScopeHeader` 残留引用，确认本变更没有修改 `SessionWorkspaceSnapshot`、`SessionScopeDiff`、stores、Main/Preload/shared contract、ACP/MCP 或持久化代码，也没有新增依赖。

## 3. Renderer 测试

- [x] 3.1 使用 `git mv` 将 `test/renderer/src/components/session-scope-header.spec.ts` 重命名为 `session-scope-popover.spec.ts`，并更新为针对 `SessionScopePopover` 的组件状态/交互测试：无 snapshot 隐藏、正常数量与固定说明、trigger tooltip/`aria-label`、打开/显式关闭、主 Project dot + 文字、snapshot 顺序与完整路径 title、16 项纵向滚动 class、范围变化 warning、失效 error 及历史 snapshot 不被当前 Workspace 替换；依赖 `test/renderer/src/setup.ts` 的 Nuxt UI stubs，不测试 `UPopover` 内部实现。
- [x] 3.2 更新 `test/renderer/src/components/chat-container.spec.ts` 的组件 stub 与断言，证明授权范围入口位于 Header 右侧、非 draft Session 才装配、旧 Header 下方 scope 区块不存在，并保证 sidebar toggle、message list、timeline 与 prompt panel 现有测试继续通过。

## 4. 视觉核对与质量门禁

- [x] 4.1 对照 `references/designs/multi-root-workspace/prototype/session-scope-popover.html` 在用户现有 dev 环境中检查浅色/深色、窄窗口、4 个与 16 个 Project、差异、失效、长名称/路径、点击外部和 `Escape`；确认 Popover 不遮断 Header 入口、不触发 Chat 横向滚动、不改变消息区域高度，并记录需要修复的偏差。不得由 Agent 启动 `pnpm dev`。
- [x] 4.2 运行 `test/renderer/src/components/session-scope-popover.spec.ts` 与 `test/renderer/src/components/chat-container.spec.ts` 的 focused renderer Vitest，随后运行全量 `pnpm test`、`pnpm typecheck`、`pnpm lint`、受影响文件 Prettier 检查和 `git diff --check`；修复所有失败。不得运行 `pnpm build`。
