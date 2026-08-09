## Why

Chat Event Rail 的 Proposal Apply 已经通过用户消息交给 Chat 流程处理，但 Archive 仍由组件直接启动运行并主动同步状态，两个生命周期入口的运行模型和视觉语义不一致。FylloCode 的后续运行方式尚待重构，因此当前需要先将 Archive 入口同样收敛为 Chat 意图，并保留底层能力与旧组件代码，避免过早删除可能复用的实现。

Apply 验证进一步发现：Chat 路径不会创建 Renderer 本地 `runMeta`，现有 `archiveReady` 却只在匹配 run 完成后成立；同时 Main 仅监听 `.openspec.yaml`，任务全部勾选不会刷新 Event Rail 的 Proposal 元数据。因此任务已完成的 Proposal 仍显示“实现中”，且没有归档入口。

Archive 验证进一步发现：Main watcher 当前绑定 Proposal 所在目录，linked Proposal 归档后又会依次 commit、merge 到 main 并删除 linked worktree，导致 watcher 可能错过归档事件、继续绑定已删除路径，甚至把已迁移到 main 的 Proposal 误报为 removed。现有 OpenSpec archive 还只移动目录，不会更新归档目录内 `.openspec.yaml` 的 `status`，因此历史归档文件仍保留 `status: applying`，Renderer 只能依赖目录位置推导 `archived`。

## What Changes

- 将 Chat Event Rail 中 `archiveReady` Proposal 卡片的“归档”按钮改为调用 `chatStore.sendMessage`，发送单个 text part：`Start archiving proposal: <changeId> (folderId: <folderId>)`。
- “归档”按钮不再由组件直接调用 `proposalRunStore.startArchive`，也不在发送消息后立即刷新 Proposal Store 或主动更新 Session Proposal；实际归档后的卡片状态继续由现有主进程 Proposal watcher 通过 IPC 推送。
- 将 Proposal 的 `archiveReady` 统一定义为 `status === "applying"`、`totalTasks > 0` 且 `doneTasks === totalTasks`，不再依赖 `runMeta.status`；Proposal detail Slideover 与 Chat Event Rail 继续复用同一展示状态规则。
- 扩展 Main Proposal watcher 以感知 `.openspec.yaml` 与 `tasks.md` 变化；`ProposalStatusChangedPayload` 增加 `changeKind: "status" | "tasks"`，任务变化事件携带当前真实 Proposal status（通常为 `applying`）并通过现有 Workspace IPC fanout 通知 Renderer。
- Renderer Session Store 收到 `changeKind: "tasks"` 后重新加载 Proposal aggregate，按完整 `ProposalRef` 将最新任务计数 upsert 到对应 Session Proposal；刷新失败时保留旧卡片。
- 让 Main watcher 将 Proposal 路径视为可迁移位置：同时保留 owner main worktree 作为稳定锚点，linked Proposal 归档、合并到 main 并删除 worktree 时重新定位和重绑 watcher，不得把迁移过程误报为 removed。
- Renderer 收到 `status: archived` 后重新加载 Proposal aggregate，并以完整 `ProposalRef` 同步 Proposal Store 与 Session Proposal，确保归档状态、worktree mode 和路径同时更新。
- 在 `fyllo-specs archive-change` 确认 OpenSpec archive 成功后、Git commit/finalization 开始前，将归档目录内 `.openspec.yaml` 的 `status` 写为 `archived`；preview、冲突或未确认归档不得写入，写入失败须保留“目录已归档”的事实、停止 Git finalization 并返回不可重跑 archive 的恢复指引。
- 新的 metadata 写回只作用于之后由 `fyllo-specs archive-change` 完成的归档，不批量回填历史 archive；Proposal reader 继续以 archive 目录位置兼容历史 `status: applying` 文件。
- 统一 Event Rail 的“开始实现”和“归档”为纯文字按钮，两个入口均不配置操作 icon。
- 对组件内因此暂时无用的直接归档引用和实现使用 `//` 注释保留，并说明“Proposal 运行入口待重构，方案确定后恢复或删除”；不添加 TODO、功能开关或新的运行状态。
- 保留底层 Apply/Archive Store、API、现有 IPC channel、MCP、运行历史以及 Proposal watcher 能力；不新增生命周期状态、Store 布尔副本或功能开关。
- 更新 `ChatProposalPanel` 组件测试，验证归档消息的完整 `ProposalRef`、单 text part、无直接 Archive 调用、无立即状态同步以及两个生命周期按钮的纯文字表现。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `proposal-browser`：定义 Chat Event Rail 的 Archive 入口通过 Chat 用户消息发起、生命周期按钮不展示 icon，并由既有主进程状态推送驱动归档后的 Session Proposal 更新。
- `fyllo-specs-archive`：定义 OpenSpec archive 确认成功后、Git finalization 前写回归档 metadata 的 `status: archived`，并约束 metadata 写入失败时的部分成功报告与恢复边界。

## Impact

- Shared contract：`src/shared/types/proposal.ts` 中的 Proposal watcher 事件原因。
- Main watcher：`src/main/services/proposal/browser/proposal-status-service.ts`。
- Main Proposal watch context：`src/main/ipc/proposal/browser.ts` 与 `src/main/services/proposal/browser/proposal-service.ts`。
- Renderer：`src/renderer/src/stores/session/session.ts`、`src/renderer/src/utils/proposal-display-status.ts` 和 `src/renderer/src/components/chat/event/ChatProposalPanel.vue`。
- MCP Archive runtime：`src/mcp-servers/fyllo-specs/src/runtime-openspec/archive-change.ts`、相关 YAML helper/error state 与 `src/mcp-servers/fyllo-specs/src/tools/archive-change.ts`。
- 测试：Main watcher、Session Store、Chat Event Rail、Proposal detail header 与 `fyllo-specs` Archive runtime/tool 的聚焦测试。
- OpenSpec：`proposal-browser` 与 `fyllo-specs-archive` 的增量要求。
- 不修改 IPC channel、Proposal lifecycle status、底层 Apply 能力或运行历史能力；Archive 变更仅增加未来归档 metadata 写回与对应失败恢复，不迁移历史文件。
