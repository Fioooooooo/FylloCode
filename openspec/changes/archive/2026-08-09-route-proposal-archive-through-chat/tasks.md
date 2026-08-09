## 1. 调整 Event Rail 生命周期入口

- [x] 1.1 修改 `src/renderer/src/components/chat/event/ChatProposalPanel.vue`：将现有直接 Archive 的 `startArchive` 实现及仅服务该实现的 `useWorkspaceStore`、`workspaceStore`、`workspaceId` 引用改为 `//` 行注释，并在相邻位置使用中文说明“Proposal 运行入口待重构，方案确定后恢复或删除”；不得删除底层 Store/API 代码、添加 TODO、lint-disable 或功能开关。
- [x] 1.2 在 `ChatProposalPanel.vue` 中实现新的 `startArchive(proposal: ProposalMeta)`，仅调用现有 `chatStore.sendMessage` 并传入单个 `{ type: "text", text: `Start archiving proposal: ${changeId} (folderId: ${folderId})` }` part；`changeId` 与 `folderId` 必须来自被点击卡片的 `proposal.proposalRef`，不得调用 `proposalRunStore.startArchive`、`proposalStore.loadProposals` 或 `sessionStore.upsertSessionProposal`。
- [x] 1.3 保持 Archive 按钮现有 `archiveReady` 显示条件与“归档”文案，移除其 `icon="i-lucide-archive"`；确认 draft 的“开始实现”按钮继续不配置 icon，两个按钮均为纯文字入口，且 Proposal detail slideover 不受修改。

## 2. 更新组件契约测试

- [x] 2.1 修改 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`：将“归档按钮直接调用 startArchive”的断言替换为精确断言 `chatStore.sendMessage` 收到一个 text part，内容为 `Start archiving proposal: change-1 (folderId: folder-b)`；同时断言 `proposalRunStore.startArchive` 未调用。
- [x] 2.2 将原“Archive 成功后主动刷新并替换 Session Proposal”测试改为消息入口的无立即副作用回归测试，断言点击并完成 `sendMessage` 后 `proposalStore.loadProposals`、`sessionStore.upsertSessionProposal` 和 `sessionStore.removeSessionProposal` 均未调用；保留现有 Session Store/Main watcher 测试作为真实状态推送链路的覆盖。
- [x] 2.3 在 `ChatProposalPanel.test.ts` 中断言“开始实现”和“归档”两个可见按钮均保留文字且没有 icon prop，并保留 Archive 仅在 `archiveReady`、归档运行中隐藏、已归档时隐藏等现有展示测试。

## 3. 验证

- [x] 3.1 若当前 main worktree 在本次 Apply 会话尚未准备环境，先运行 `sh scripts/prepare-worktree-env.sh`；随后运行 `pnpm exec vitest run --project renderer test/renderer/src/components/chat/event/ChatProposalPanel.test.ts test/renderer/src/stores/session/session.spec.ts`，确认消息入口及既有 Renderer 状态推送处理通过。
- [x] 3.2 运行 `pnpm exec vitest run --project main test/main/services/proposal/browser/proposal-status-service.spec.ts`，确认未改动的 Main Proposal watcher 仍能推送状态变化与移除事件。
- [x] 3.3 运行 `pnpm typecheck:web`、`pnpm lint` 以及针对修改文件的 `pnpm exec prettier --check src/renderer/src/components/chat/event/ChatProposalPanel.vue test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`；本变更不涉及构建配置，不运行 `pnpm build`。

## 4. 扩展 Proposal watcher 事件契约

- [x] 4.1 修改 `src/shared/types/proposal.ts` 的 `ProposalStatusChangedPayload`，增加必填 `changeKind: "status" | "tasks"`；保持现有 `workspaceId`、完整 `ProposalRef`、`sessionId`、`status`、`updatedAt` 与可选 `removed` 字段，不新增 IPC channel 或生命周期状态。
- [x] 4.2 修改 `src/main/services/proposal/browser/proposal-status-service.ts`：将每个 Proposal watcher 绑定到解析后的 change 目录，文件事件只处理 `.openspec.yaml` 与 `tasks.md`；status 初始化/变化/移除事件发送 `changeKind: "status"`，`tasks.md` 事件发送 `changeKind: "tasks"` 与 watcher 当前 status；保留 Workspace + ProposalRef watcher identity、Session fanout、归档目录重绑及幂等 unwatch 行为。

## 5. 刷新 Session Proposal 并统一可归档规则

- [x] 5.1 修改 `src/renderer/src/stores/session/session.ts#handleProposalStatusChanged`：收到 `changeKind: "tasks"` 时调用现有 `proposalStore.loadProposals()`，按 payload 的完整 `ProposalRef` 查找最新 Proposal 并 upsert 到 payload 指定 Session；刷新失败或目标暂时缺失时保留旧 Session Proposal，普通 status 与 removed 事件保持现有行为。
- [x] 5.2 修改 `src/renderer/src/utils/proposal-display-status.ts#canArchiveProposal`：只在 Proposal status 为 `applying`、`totalTasks > 0` 且 `doneTasks === totalTasks` 时返回 true，不读取 `runMeta.status` 或 run identity；保持 `getProposalDisplayStatus` 作为 `ProposalDetailHeader.vue` 与 `ChatProposalPanel.vue` 的共享入口。

## 6. 更新回归测试

- [x] 6.1 更新 `test/main/services/proposal/browser/proposal-status-service.spec.ts` 的 `fs.watch` mock 与断言，覆盖目录 watcher、`.openspec.yaml` 的 `changeKind: "status"`、`tasks.md` 的 `changeKind: "tasks"`、当前 status 复用、完整 ProposalRef 隔离、归档目录重绑和 removed 清理。
- [x] 6.2 更新 `test/renderer/src/stores/session/session.spec.ts`，覆盖 tasks 事件触发 aggregate reload、按完整 ProposalRef upsert 最新任务计数、刷新失败保留旧卡片，以及 status/removed 事件不发生行为回归。
- [x] 6.3 更新 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts` 与 `test/renderer/src/components/proposal-detail-header.spec.ts`，覆盖 `applying + doneTasks === totalTasks + totalTasks > 0` 在无 runMeta 时同时展示 `archiveReady`/归档按钮，未完成任务与零任务保持“实现中”，并移除 archive-ready 对 `runMeta.status === "done"` 的依赖断言。

## 7. 扩展范围验证

- [x] 7.1 运行 `pnpm exec vitest run --project main test/main/services/proposal/browser/proposal-status-service.spec.ts` 与 `pnpm exec vitest run --project renderer test/renderer/src/stores/session/session.spec.ts test/renderer/src/components/chat/event/ChatProposalPanel.test.ts test/renderer/src/components/proposal-detail-header.spec.ts`。
- [x] 7.2 运行 `pnpm typecheck:node`、`pnpm typecheck:web`、`pnpm lint` 以及针对本轮修改代码/测试的 Prettier check；本变更不涉及构建配置，不运行 `pnpm build`。

## 8. 让 Proposal watcher 支持 linked 到 main 的位置迁移

- [x] 8.1 扩展 Main Proposal watch context：在不向 Renderer 暴露 owner绝对路径的前提下，由 `src/main/services/proposal/browser/proposal-service.ts` 与 `src/main/ipc/proposal/browser.ts` 为 `ProposalStatusService` 提供经 Workspace owner验证的main folder path、初始target path与worktree mode；watch identity继续使用`workspaceId + ProposalRef`。
- [x] 8.2 修改 `src/main/services/proposal/browser/proposal-status-service.ts`：保留当前Proposal目录的content watcher，并增加当前target `openspec/changes/`与owner main archive稳定目标的location watcher；rename、空filename、重复事件或watcher error只触发幂等reconciliation。linked archive合并到main后重绑content watcher，linked worktree随后删除不得发送removed；只有当前target与owner main经过有界重试均不存在时才发送removed。
- [x] 8.3 处理main archive root尚不存在与watcher生命周期：监听稳定的main `openspec/changes/`并在archive root出现后附加目标watcher；最后一个Session取消、Workspace关闭与应用退出时关闭该Proposal的全部watcher和待处理重试，不泄漏timer或FSWatcher。
- [x] 8.4 修改 `src/renderer/src/stores/session/session.ts#handleProposalStatusChanged`：收到`changeKind: "status"`且`status: archived`时重新加载当前Workspace Proposal aggregate，按完整ProposalRef将最新status、worktreeMode与worktreePath upsert到指定Session；加载失败或暂时缺失时保留旧卡片。

## 9. 在 Archive commit 前持久化 archived metadata

- [x] 9.1 修改 `src/mcp-servers/fyllo-specs/src/runtime-openspec/archive-change.ts`及其YAML helper：仅在`parseArchiveOutcome`确认success后读取`archiveTarget/.openspec.yaml`，保留其他字段并幂等写入`status: archived`；写回发生在`finalizeArchiveWorkspace`之前，preview、冲突、CLI失败与未确认archive不得写入。
- [x] 9.2 修改 `src/mcp-servers/fyllo-specs/src/tools/archive-change.ts`与runtime workspace recovery类型：metadata写入失败时保留`archive.ok: true`、实际target与raw output，返回顶层failed、未启动的finalization和`archive-metadata-update` agent recovery；指引必须禁止重跑OpenSpec archive，并要求修复metadata后从commit/merge/cleanup继续。
- [x] 9.3 保持历史兼容：不修改既有`openspec/changes/archive/**/.openspec.yaml`，确认Main Proposal reader继续以archive location覆盖历史`status: applying`；不新增Proposal lifecycle status、IPC channel或Renderer run state。

## 10. 补充迁移与 metadata 回归测试

- [x] 10.1 扩展 `test/main/services/proposal/browser/proposal-status-service.spec.ts`，覆盖linked active→linked archive→main archive→linked删除、merge失败保留linked archive、main archive root延迟出现、空filename/重复事件/error、有界重试后removed、完整ProposalRef隔离及全部watcher/timer清理。
- [x] 10.2 扩展 `test/renderer/src/stores/session/session.spec.ts`，覆盖archived status事件刷新aggregate并同步main target metadata、刷新失败保留旧Session Proposal、其他Folder同名Proposal不受影响。
- [x] 10.3 扩展 `test/mcp-servers/fyllo-specs/openspec-runtime.test.ts`与Archive tool聚焦测试，覆盖success写入、其他metadata保留、preview/冲突/未确认不写入、已archived幂等、linked finalization commit包含写回，以及metadata写入失败的部分成功state和recovery指引。

## 11. 验证补充实现

- [x] 11.1 运行Main watcher、Renderer Session Store与`fyllo-specs` Archive runtime/tool的聚焦Vitest测试，并确认全部通过。
- [x] 11.2 运行`pnpm typecheck:node`、`pnpm typecheck:web`、`pnpm lint`、本轮修改文件的Prettier check与`git diff --check`；遵循项目release feedback，不在未获明确批准时运行`pnpm build`。

## 12. 收敛 Main Proposal watcher 生命周期

- [x] 12.1 由 Main 在 Session 持久化删除成功后解除该 Session 的全部 Proposal watcher 引用；最后一个 Session 引用释放、Proposal 到达 main archive、Proposal removed、Workspace 关闭或应用退出时关闭全部关联 `FSWatcher` 与重试 timer，不新增 Renderer IPC channel。
- [x] 12.2 为 Proposal content/location watcher 的创建、文件事件触发与关闭增加结构化日志，包含 Workspace、完整 ProposalRef、target/worktree、Session、watcher 类型、路径、数量与释放原因等排查字段。
- [x] 12.3 补充 Session 删除、共享引用、linked merge 失败、main archive 终态释放及 watcher 生命周期日志测试，并重新运行 Main 聚焦测试、Node 类型检查、lint、Prettier 与 `git diff --check`。
