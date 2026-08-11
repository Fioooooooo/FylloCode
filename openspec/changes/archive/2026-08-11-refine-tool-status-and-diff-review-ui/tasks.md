## 1. Turn 文件变更投影与控制器

- [x] 1.1 新建 `src/renderer/src/features/turn-file-change-review/README.md`、`model/turn-file-changes.ts` 与根 `index.ts`：定义 `TurnFileChange`（path、original、modified、kind）及 `projectTurnFileChanges()` / `selectToolTurnFileChanges()`，按输入顺序聚合 `ToolCallDiff[][]`，使用最早 oldText、最晚 newText、首次路径顺序，过滤 original === modified，并正确分类 added/modified/deleted；model 只能依赖 `@shared` 纯类型，公共入口显式导出且不得 `export *`。
- [x] 1.2 新增 `test/renderer/src/features/turn-file-change-review/model/turn-file-changes.spec.ts`，覆盖跨多个工具的同路径合并、新建后继续修改、修改后删除、新建后删除/修改后恢复原状、重复 path 去重、首次顺序、工具自身入口筛选，以及输入数组不被修改；验收标准是聚合结果不包含中间版本或净零变化。
- [x] 1.3 新建 `application/turn-file-change-review-controller.ts` 及镜像测试，使用 feature-local reactive state 管理 changes 与 selectedPath；实现初始化、选择、流式 `setChanges()`、选中项保留/消失回退、空集合清空和 dispose，且不引入 Pinia、API、IPC 或 durable 状态。

## 2. stream-monaco Diff Slideover

- [x] 2.1 增强 `ui/TurnFileDiffPanel.vue`：保存 Diff Editor 实例，在 `onDidUpdateDiff`、两侧 `onDidContentSizeChange` 与 `onDidChangeHiddenAreas` 后通过 RAF 读取较大的 `getContentHeight()`、更新容器高度并调用 `layout()`；值未变化时不重复 layout，折叠时暂停测量、重新展开时恢复，卸载时清理 listener 与 RAF；继续保持 `renderOverviewRuler=false`、无固定/最大高度、主题同步和既有 create/update/cleanup 语义，不修改 `stream-monaco` 源码。
- [x] 2.2 调整 `TurnFileChangeReviewSlideover.vue` 的多项 Accordion：默认全部折叠，文件第一次展开时才挂载 `TurnFileDiffPanel`，之后依靠 `unmount-on-hide=false` 保留已创建 editor；流式更新时保留仍有效的 expanded/mounted path，移除消失 path，新路径保持未挂载与折叠；现有 960px 宽度、外层滚动、完整 path/kind 与键盘交互保持不变。
- [x] 2.3 新建 `integration/use-turn-file-change-review.ts` 并从根 `index.ts` 导出稳定打开用例：使用 Nuxt UI `useOverlay()`、`destroyOnClose` 和 controller 装配 window-level Slideover，窗口内新打开替换旧实例；接收调用方的响应式 turn changes 与 initialPath，overlay 存活期间同步流式变化，finally 中停止 watcher 并 dispose controller。
- [x] 2.4 扩展 `turn-file-change-review-slideover.spec.ts` 与 integration 测试：断言默认折叠不创建 editor、首次展开延迟创建、多项展开、折叠保留与重开不重建；模拟 diff/content/hidden-area 事件，断言高度取两侧较大 `getContentHeight()`、相同高度不重复 layout、隐藏时不测量、重开恢复、streaming 更新以及 listener/RAF cleanup；保留 `renderOverviewRuler=false`、主题、overlay 替换和空结果覆盖。

## 3. Chat 工具入口与状态视觉

- [x] 3.1 修改 `src/renderer/src/components/chat/message/AssistantMessage.vue`：基于现有 `projectSubagentCalls()` 排除 hiddenPartIndexes 与子 Agent 根调用，从其余普通 tool parts 的 `getToolDiffs()` 计算单个 turn changes computed；把同一结果传给直接 `ChatToolItem` 与 `ChatActivityGroup`，再由 group 原样传给每个子工具，不修改 `message.parts` 或现有 activity projection。
- [x] 3.2 修改 `src/renderer/src/utils/chatTool.ts` 与 `ChatToolItem.vue`：工具可见标题只使用 `getToolText()`；pending/in_progress/completed 通过 `UChatTool.suffix` + `ui.suffix: "sr-only"` 保留可访问状态但不显示后缀，pending/in_progress 继续由 `isToolStreaming()` shimmer，failed 使用可见“失败” suffix 与 `ui.leadingIcon: "text-error"`，Error 详情和旧 AI state fallback 保持不变。
- [x] 3.3 修改 `ChatToolDetails.vue`：移除内联 oldText/newText、“修改前 / 修改后 / 新增内容”块，改为渲染 `selectToolTurnFileChanges()` 产生的精简 path + kind 按钮；点击或键盘激活时通过 `@renderer/features/turn-file-change-review` 打开完整 turn changes 并默认选中该 path；Locations 继续从 `@renderer/features/local-file-preview` 打开，Input/Output/Error 与空分区规则不变。
- [x] 3.4 更新 `test/renderer/src/utils/chat-tool.test.ts` 和 `test/renderer/src/components/shared/ui-message-list.spec.ts`：覆盖直接工具与 Activity group 子工具的无可见 pending/in_progress/completed 后缀、shimmer input states、sr-only suffix、失败文字/error icon、group header 不变；覆盖多工具 turn 聚合、隐藏子 Agent diff 排除、路径类型按钮、默认 path、无内联完整内容、新建文件与实时/历史消息一致。

## 4. 项目指南同步

- [x] 4.1 更新 `guidelines/UiDesign.md`“文案与可访问性”的状态规则：普通进行中工具允许使用 Nuxt UI shimmer 替代可见状态文字，但必须提供屏幕阅读器可识别的文字；错误和警告仍必须显示可见文字，颜色/icon 只能强化语义。同步相关示例或验证重点时不得放宽其他 badge、成功、危险操作的状态可访问性要求。

## 5. 回归验证

- [x] 5.1 在当前 worktree 先运行 `sh scripts/prepare-worktree-env.sh`，再运行 turn-file-change-review model/controller/UI/integration、`chat-tool.test.ts`、`ui-message-list.spec.ts` 与现有 local-file-preview Slideover 聚焦 Vitest；修复失败并确认未新增依赖、未触及 ACP mapper、assembler、JSONL、location preview 或 Session 级聚合。
- [x] 5.2 运行 `pnpm typecheck`、`pnpm lint` 与 `git diff --check`；人工检查浅色/深色、桌面/窄窗口、短/长 diff、折叠 unchanged ranges、默认全折叠与首次展开、多项展开、流式更新、重复折叠重开、无 `diffOverview`、键盘焦点和 Slideover 外层滚动，确认可见高度无大片空白、裁切、抖动或 layout 循环；若结果不理想，使用基线 commit `23b9ab69` 回退本轮高度同步改动。
