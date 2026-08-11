## Context

普通工具目前由 `ChatToolItem.vue` 把 `getToolStatusText()` 无条件追加到标题，并用 `isToolStreaming()` 驱动 `UChatTool` shimmer。结构化 ACP diff 已经随每个 `DynamicToolUIPart` 持久化在 `toolMetadata.diff`，但 `ChatToolDetails.vue` 直接渲染完整 old/new 文本；它只知道当前 part，无法看到同一 assistant message 中其他工具的变更。

项目已经锁定 `stream-monaco@0.0.46`，其 `useMonaco()` 提供 `createDiffEditor()`、`updateDiff()`、`cleanupEditor()` 与 `setTheme()`。现有 `local-file-preview` feature 已验证 Nuxt UI window-level overlay、Monaco 主题切换和销毁模式，但它的 controller 负责磁盘读取与授权，不适合承载已经存在消息中的 diff snapshot。

## Goals / Non-Goals

**Goals:**

- 移除成功和非终态工具的可见状态后缀，同时保留 Nuxt UI shimmer、可访问状态名称和明确失败语义。
- 从一条 assistant message 的可见普通工具中计算当前 turn 的净文件变更，并让所有对应工具入口打开同一组变更。
- 使用全宽 Nuxt UI Accordion 在与现有文件预览一致宽度的 Slideover 中列出新增、修改和删除文件，默认全部折叠且允许任意多项同时展开；每个文件项维护独立只读 `stream-monaco` Diff Editor，支持实时 turn 更新、历史消息、主题切换与窄窗口。
- 保留原始 `message.parts`、ACP diff snapshot、Activity group 投影、location 预览和 JSONL 契约。

**Non-Goals:**

- 不聚合整个 Session，不计算 Git/worktree 当前状态，也不重新读取磁盘验证或刷新 diff。
- 不改变 ACP mapper、共享 stream schema、Main/Renderer assembler 或消息持久化格式。
- 不复用或扩展 `local-file-preview` 的文件授权 controller，不提供 diff 编辑、接受/拒绝 hunk、暂存或回滚能力。
- 不在消息流内继续展示完整 old/new 文本；Slideover 关闭后不保留 Monaco Diff Editor。

## Decisions

### 1. 建立 `turn-file-change-review` Renderer feature

新增 `src/renderer/src/features/turn-file-change-review/`，按实际职责使用：

- `model/turn-file-changes.ts`：纯类型、turn diff 聚合、变更类型与语言检测输入选择；不依赖 Vue 或宿主组件。
- `application/turn-file-change-review-controller.ts`：持有当前 changes、selectedPath，接收流式更新并在选中项消失时稳定回退。
- `ui/TurnFileChangeReviewSlideover.vue`：管理 Slideover 和可多项展开的全宽文件 Accordion；每个文件项由独立 Diff Panel 管理 Monaco 生命周期。
- `integration/use-turn-file-change-review.ts`：通过 `useOverlay()` 装配 controller 与 Slideover，保证窗口内同一时刻只有一个 review overlay，并把调用方的响应式 turn changes 同步给 controller。
- 根 `index.ts` 只显式导出稳定的 `TurnFileChange` 类型、投影函数和打开用例；feature 外部不得深路径导入。

选择独立 feature 而不是扩展 `local-file-preview`，因为前者展示消息内已有 snapshot，不经过路径授权或磁盘读取；两者只共享 `stream-monaco` 与 Nuxt UI 的既有技术模式。选择 feature 而不是继续堆叠 chat 相邻组件，是因为该能力同时拥有纯聚合规则、响应式 controller、第三方编辑器生命周期和 window-level overlay 集成。

### 2. 当前 turn 等于当前 assistant message，且只聚合可见普通工具

`AssistantMessage.vue` 已拥有完整 `message.parts` 和 `projectSubagentCalls()` 结果。它 SHALL 排除 `hiddenPartIndexes` 与子 Agent 根调用，只把其余普通 tool parts 交给 `projectTurnFileChanges()`；这样直接工具和 `ChatActivityGroup` 子工具共享同一个 computed 结果，不会把只应在子 Agent inspector 中出现的后代变更泄漏到普通列表。

聚合按 part 顺序和每个 part 内 diff 顺序遍历：

1. 路径首次出现时，`oldText` 作为 original；缺失 oldText 表示 original 为空。
2. 该路径每次出现都以当前 `newText` 更新 modified。
3. original 与最终 modified 相同则移除，表示本轮无净变化。
4. original 为空且 modified 非空为 `added`；original 非空且 modified 为空为 `deleted`；其余为 `modified`。
5. 文件列表顺序使用路径首次出现顺序，不按字母重排。

聚合结果是 turn 的 ACP snapshot 投影，不宣称等于当前工作区 Git diff。同一路径的中间版本不进入最终审查视图。

### 3. 工具入口保留本工具路径，但打开完整 turn 变更

`AssistantMessage.vue` 把 turn changes 传给直接 `ChatToolItem` 和 `ChatActivityGroup`，group 再传给子工具。`ChatToolDetails.vue` 的 Changes 区只显示当前工具 diff 中仍存在于 turn 净变化集合的去重路径和新增/修改/删除类型，不显示 old/new 内容。

点击某一路径时，调用 feature 公共打开用例，传入响应式 turn changes 和该路径作为 `initialPath`。Slideover 展示整组 turn changes，并默认选中被点击路径；若后续流式更新使该路径消失，controller 选择列表第一项；列表为空时关闭或显示无净变化状态，不保留陈旧内容。

### 4. 与文件预览同宽的多项 Accordion，每个展开项隔离 Diff Editor

Slideover 使用 Nuxt UI `UAccordion` 作为文件列表，宽度与现有本地文件预览一致（最大 `960px`），桌面与窄窗口采用同一全宽结构，不再提供左侧文件栏或顶部选择器。每个触发项显示完整路径和“新增 / 修改 / 删除”语义；初次打开时所有文件项默认折叠，之后用户可任意展开或收起多个文件，不限制同时展开数量。流式新增的路径同样默认折叠，用户已展开且仍存在的路径保持展开。

每个文件项通过独立 Diff Panel 调用 `useMonaco({ readOnly: true, minimap: { enabled: false }, automaticLayout: true, ... })` 管理自己的 editor。Accordion 显式设置 `unmount-on-hide="false"`，因此收起只隐藏 content，不卸载 Diff Panel：

- 文件项展开并挂载时调用 `createDiffEditor(container, original, modified, language)`。
- 同一展开文件收到流式内容更新时调用自身的 `updateDiff(original, modified, language)`，不影响其他文件项。
- 文件项收起时保留自身 editor 和 model；再次展开直接显示原 content，不重新创建或复用已清理的 model。
- Diff Panel 不设置固定高度或用户可见的最大高度；`stream-monaco` 使用不截断内容的高度上限值计算自然内容高度，由 Slideover body 承担整组文件的纵向滚动。
- Diff Panel 设置 `renderOverviewRuler: false`，关闭 Monaco 由两个 15px lane 组成的 `diffOverview`；外层已经负责滚动，不保留容易被误认为宽滚动条的概览尺。
- language 使用 `stream-monaco` 的 `detectLanguage(modified || original)`，避免复制 Main 的路径语言表或直接导入 `monaco-editor`。
- 每个 Diff Panel 的主题跟随 `useColorMode()`，使用现有 `vitesse-light` / `vitesse-dark`。
- overlay 关闭、组件卸载或创建被替代时必须清理所有文件项的 editor，并取消 watcher/controller。

每个文件项在 Slideover 生命周期内保留 Monaco model/editor 会增加内存占用，但这是避免折叠重开时 content 被销毁、并支持自由对比所需的明确取舍；资源统一在 Slideover 关闭时释放。

### 5. 可见状态文案只保留失败，其他状态用 sr-only suffix

`ChatToolItem.vue` 继续传递原工具名称给 `UChatTool.text`，因此 `pending` / `in_progress` 会由 `isToolStreaming()` 自动产生 shimmer，`completed` 进入稳定普通文本。三者不显示可见状态后缀，但通过 `UChatTool.suffix` 配合 `ui.suffix: "sr-only"` 暴露“等待执行 / 正在执行 / 已完成”的可访问名称。

`failed` 使用可见 suffix“失败”，并通过 `ui.leadingIcon: "text-error"` 给具体工具 icon 添加 error 语义色；Error 分区保持不变。Activity group header 不添加整组状态，展开后的子工具复用同一个 `ChatToolItem`。

`guidelines/UiDesign.md` 的状态规则同步调整为：普通进行中工具可用 shimmer 替代可见状态文字，但必须提供屏幕阅读器可识别的文字；错误和警告仍必须有可见文字，颜色或 icon 只能作为强化。

## Risks / Trade-offs

- [ACP snapshot 与磁盘当前内容可能不同] → Slideover 明确以“本轮文件变更”呈现，不调用本地文件读取 API，也不暗示 Git 状态。
- [同一路径多次不连续修改时隐藏中间版本] → 按已确认规则只展示最早 original 与最终 modified，并用纯投影测试固定顺序和净变化语义。
- [多个大文件的 Monaco editor 在折叠后仍占用内存] → 每个文件项关闭 minimap、启用 automatic layout；不跨 Slideover 生命周期缓存，关闭 overlay 时清理全部实例。
- [streaming 期间文件集合变化会覆盖用户展开选择] → 保留仍存在路径的用户展开状态，新出现路径保持默认折叠；消失路径从展开集合移除，避免陈旧内容。
- [shimmer 对部分用户不够明确] → pending/in-progress/completed 均保留 sr-only 状态文字；failed 继续显示可见文字与 error icon，不把失败只交给颜色。
- [不限制 Accordion content 高度时长文件会显著拉长列表] → 接受由 Slideover 外层统一滚动的审查体验，避免每个文件形成嵌套滚动区；文件触发项保持可访问，并人工验证长文件、窄窗口和折叠定位。

## Migration Plan

1. 先建立纯 turn diff 投影与测试，再建立 controller、overlay 和 Monaco UI。
2. 将 `AssistantMessage` 的完整 turn 上下文传递到直接工具与 Activity group 子工具，最后替换内联 diff 展示和状态标题。
3. 更新组件测试、feature 测试和 UI guideline，运行 Renderer 聚焦测试、typecheck 与 lint，并进行主题/窄窗口人工检查。
4. 本变更没有数据迁移；回滚只需恢复旧工具文案和内联 diff 组件，已持久化消息仍保持兼容。

## Open Questions

无。
