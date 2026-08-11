# Turn File Change Review

## 状态

已实现。该 feature 从单条 assistant message 的结构化 ACP diff snapshot 投影本轮净文件变更，
并通过 window-level Slideover 提供只读审查入口。

## 范围

- `model/`：按路径聚合本轮 diff，保留最早 original、最终 modified 与首次出现顺序。
- `application/`：管理 Slideover 生命周期内的文件集合和当前选择。
- `ui/`：使用默认全折叠、可多项展开的 Accordion，并为每个文件维护独立的 `stream-monaco` Diff Editor；关闭 `diffOverview`，content 随 diff 自然撑开，折叠只隐藏 content，关闭 Slideover 时统一清理。
- `integration/`：将聊天宿主的响应式 turn changes 接入 Nuxt UI overlay。

## 非范围

- 不重新读取本地文件，不执行路径授权，也不复用 `local-file-preview` controller。
- 不聚合整个 Session，不计算 Git/worktree 当前差异。
- 不编辑、接受、拒绝、暂存或回滚变更。

## 来源与边界

原始 diff 来自聊天工具 part 的 `toolMetadata.diff`。聊天宿主负责筛选当前 assistant message
中的可见普通工具，feature 只接收已筛选的 `ToolCallDiff[][]` 并生成不可变投影。外部消费者只从
根 `index.ts` 使用稳定 API，不得深路径导入内部层。

## 迁移触发条件

如果未来需要 Session 级变更、磁盘实时内容或 Git/worktree 状态，应建立由 Main 提供真实文件状态的
独立能力，而不是扩展本 feature 的消息 snapshot 语义。
