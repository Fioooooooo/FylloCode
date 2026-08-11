## 1. Turn 文件变更投影与控制器

- [x] 1.1 新建 `src/renderer/src/features/turn-file-change-review/README.md`、`model/turn-file-changes.ts` 与根 `index.ts`：定义 `TurnFileChange`（path、original、modified、kind）及 `projectTurnFileChanges()` / `selectToolTurnFileChanges()`，按输入顺序聚合 `ToolCallDiff[][]`，使用最早 oldText、最晚 newText、首次路径顺序，过滤 original === modified，并正确分类 added/modified/deleted；model 只能依赖 `@shared` 纯类型，公共入口显式导出且不得 `export *`。
- [x] 1.2 新增 `test/renderer/src/features/turn-file-change-review/model/turn-file-changes.spec.ts`，覆盖跨多个工具的同路径合并、新建后继续修改、修改后删除、新建后删除/修改后恢复原状、重复 path 去重、首次顺序、工具自身入口筛选，以及输入数组不被修改；验收标准是聚合结果不包含中间版本或净零变化。
- [x] 1.3 新建 `application/turn-file-change-review-controller.ts` 及镜像测试，使用 feature-local reactive state 管理 changes 与 selectedPath；实现初始化、选择、流式 `setChanges()`、选中项保留/消失回退、空集合清空和 dispose，且不引入 Pinia、API、IPC 或 durable 状态。

## 2. stream-monaco Diff Slideover

- [x] 2.1 新建 `ui/TurnFileDiffPanel.vue` 并收敛 `TurnFileChangeReviewSlideover.vue` 的编辑器职责：每个文件项通过独立 `useMonaco()` 实例调用 `createDiffEditor()`、`updateDiff()`、`cleanupEditor()`、`setTheme()` 与 `detectLanguage()`；设置 `renderOverviewRuler=false` 关闭 Monaco `diffOverview`；新增/修改/删除分别映射为空 original、双侧内容、空 modified，主题使用 `vitesse-light` / `vitesse-dark`，Diff Panel 不设置固定高度或最大高度、由内容自然撑开，折叠期间保留 editor，Slideover 关闭、替代创建和卸载时清理资源，不得直接导入 `monaco-editor` 或读取本地文件 API。
- [x] 2.2 在 Slideover 中使用 Nuxt UI `UAccordion` 实现桌面与窄窗口一致的全宽文件列表，并将最大宽度调整为与本地文件预览一致的 `960px`：按首次顺序显示完整 path 和“新增 / 修改 / 删除”，默认全部折叠且允许任意多项同时展开，设置 `unmount-on-hide=false` 使折叠只隐藏 content，Accordion content 不设置最大高度并由 Slideover body 统一滚动；保留仍存在路径的用户展开状态，新出现路径默认折叠、消失路径从集合移除；触发项与关闭操作保留键盘和 focus-visible，标题明确为“本轮文件变更”。
- [x] 2.3 新建 `integration/use-turn-file-change-review.ts` 并从根 `index.ts` 导出稳定打开用例：使用 Nuxt UI `useOverlay()`、`destroyOnClose` 和 controller 装配 window-level Slideover，窗口内新打开替换旧实例；接收调用方的响应式 turn changes 与 initialPath，overlay 存活期间同步流式变化，finally 中停止 watcher 并 dispose controller。
- [x] 2.4 更新 `test/renderer/src/setup.ts` 的 `stream-monaco` 默认 mock，并维护 `test/renderer/src/features/turn-file-change-review/ui/turn-file-change-review-slideover.spec.ts` 与 `integration/use-turn-file-change-review.spec.ts`：断言 `renderOverviewRuler=false`、create/update 参数、Accordion 默认全折叠与任意多项展开、`unmount-on-hide=false`、content 无固定/最大高度、折叠 content/editor 保留、重复重开不重建、流式更新、主题、展开集合流式同步、空结果、overlay 替换和 cleanup；测试只验证本 feature 行为，不依赖 Nuxt UI 内部 DOM 实现。

## 3. Chat 工具入口与状态视觉

- [x] 3.1 修改 `src/renderer/src/components/chat/message/AssistantMessage.vue`：基于现有 `projectSubagentCalls()` 排除 hiddenPartIndexes 与子 Agent 根调用，从其余普通 tool parts 的 `getToolDiffs()` 计算单个 turn changes computed；把同一结果传给直接 `ChatToolItem` 与 `ChatActivityGroup`，再由 group 原样传给每个子工具，不修改 `message.parts` 或现有 activity projection。
- [x] 3.2 修改 `src/renderer/src/utils/chatTool.ts` 与 `ChatToolItem.vue`：工具可见标题只使用 `getToolText()`；pending/in_progress/completed 通过 `UChatTool.suffix` + `ui.suffix: "sr-only"` 保留可访问状态但不显示后缀，pending/in_progress 继续由 `isToolStreaming()` shimmer，failed 使用可见“失败” suffix 与 `ui.leadingIcon: "text-error"`，Error 详情和旧 AI state fallback 保持不变。
- [x] 3.3 修改 `ChatToolDetails.vue`：移除内联 oldText/newText、“修改前 / 修改后 / 新增内容”块，改为渲染 `selectToolTurnFileChanges()` 产生的精简 path + kind 按钮；点击或键盘激活时通过 `@renderer/features/turn-file-change-review` 打开完整 turn changes 并默认选中该 path；Locations 继续从 `@renderer/features/local-file-preview` 打开，Input/Output/Error 与空分区规则不变。
- [x] 3.4 更新 `test/renderer/src/utils/chat-tool.test.ts` 和 `test/renderer/src/components/shared/ui-message-list.spec.ts`：覆盖直接工具与 Activity group 子工具的无可见 pending/in_progress/completed 后缀、shimmer input states、sr-only suffix、失败文字/error icon、group header 不变；覆盖多工具 turn 聚合、隐藏子 Agent diff 排除、路径类型按钮、默认 path、无内联完整内容、新建文件与实时/历史消息一致。

## 4. 项目指南同步

- [x] 4.1 更新 `guidelines/UiDesign.md`“文案与可访问性”的状态规则：普通进行中工具允许使用 Nuxt UI shimmer 替代可见状态文字，但必须提供屏幕阅读器可识别的文字；错误和警告仍必须显示可见文字，颜色/icon 只能强化语义。同步相关示例或验证重点时不得放宽其他 badge、成功、危险操作的状态可访问性要求。

## 5. 回归验证

- [x] 5.1 在当前 worktree 先运行 `sh scripts/prepare-worktree-env.sh`，再运行 turn-file-change-review model/controller/UI/integration、`chat-tool.test.ts`、`ui-message-list.spec.ts` 与现有 local-file-preview Slideover 聚焦 Vitest；修复失败并确认未新增依赖、未触及 ACP mapper、assembler、JSONL、location preview 或 Session 级聚合。
- [x] 5.2 运行 `pnpm typecheck`、`pnpm lint` 与 `git diff --check`；人工检查浅色/深色、桌面/窄窗口、单文件/多文件、Accordion 默认全折叠与任意多项展开、右侧无 `diffOverview`、新增/修改/删除、无 content 高度上限的长文件外层滚动、streaming 更新、键盘焦点及重复折叠重开内容保留，确认每个文件项的 Monaco Diff Editor 独立、折叠时不销毁且关闭时清理，工具消息中不再内联完整 diff。
