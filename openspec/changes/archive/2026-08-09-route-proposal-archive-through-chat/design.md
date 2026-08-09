## Context

`ChatProposalPanel.vue` 当前有两种不同的 Proposal 生命周期入口：`startApply` 已调用 `chatStore.sendMessage` 发送 Chat 用户消息，`startArchive` 则仍直接调用 `proposalRunStore.startArchive`，等待运行完成后执行 `proposalStore.loadProposals()`，再通过 `sessionStore.upsertSessionProposal()` 更新 Event Rail 卡片。与此同时，Session Store 已订阅由 Main `ProposalStatusService` 广播的 `statusChanged` 事件，实际 Proposal 状态变化会通过既有 IPC 链路更新或移除 Session Proposal。

本次变更调整 Event Rail 入口及其可归档状态的数据链路，不定义新的 Proposal 运行方式。Apply/Archive 均通过 Chat 消息发起，因此 Renderer 本地 `runMeta` 不再是生命周期完成度的可靠来源；OpenSpec `tasks.md` 的任务完成度才是 Chat Apply 路径可归档状态的事实来源。用户明确要求不引入功能开关、不删除底层能力、不添加 TODO，并对暂时无用的组件内旧实现使用行注释保留，说明待重构后恢复或删除。

验证归档链路后确认，linked Proposal 的实际顺序是 OpenSpec archive、linked commit、merge-to-main、worktree-remove、branch-delete。归档目录会先短暂存在于 linked worktree，随后随 commit 合并到 main，最后 linked 路径整体消失。现有 watcher 只保存最初的 `worktreePath` 并在该路径内调用 `resolveChangeDirInTarget`，无法把 main archive 识别为同一 Proposal 的稳定落点。与此同时，OpenSpec CLI 移动目录后不会修改 `.openspec.yaml`，当前仓库历史 archive 中该字段仍是 `status: applying`。

## Goals / Non-Goals

**Goals:**

- 让 Event Rail 的 Archive 与 Apply 一样，将完整 `ProposalRef` 编码为 Chat 用户消息。
- 保持 Archive 入口仅在现有 `archiveReady` 展示状态下可用。
- 让“开始实现”和“归档”按钮都不配置 icon，避免图标暗示点击后由组件立即执行生命周期操作。
- 让实际归档后的 Event Rail 状态继续由现有 Main watcher → IPC → Session Store 链路驱动。
- 让 `tasks.md` 最后一个任务被勾选后，Main 主动通知 Renderer 刷新 Proposal 元数据。
- 让 Slideover 与 Event Rail 统一依据 `ProposalMeta.doneTasks/totalTasks` 派生 `archiveReady`，不依赖 `runMeta.status`。
- 让 owner-qualified watcher 在 linked archive 合并到 main 并删除 worktree时重新定位到 main archive，不把跨 worktree 迁移误报为 removed。
- 让 archived status 事件同时刷新 Proposal Store 与 Session Proposal，避免 UI 继续持有旧 linked path。
- 让未来通过 `fyllo-specs archive-change` 完成的归档在 commit 前持久化 `status: archived`。
- 注释保留组件内直接 Archive 代码及仅服务该代码的引用，便于近期运行模型重构时恢复或删除。

**Non-Goals:**

- 不修改 `proposalRunStore`、Renderer直接Archive API或Preload channel；MCP变更限定为OpenSpec archive成功后的metadata写回与失败恢复。
- 不改变 OpenSpec CLI、Git commit/merge/worktree cleanup 的既有执行所有权与相对顺序。
- 不新增 feature flag、生命周期状态、Store 布尔副本或新的 IPC channel。
- 不让 `runMeta.status` 参与可归档判断；保留它仅供旧运行面板与注释代码使用。
- 不恢复 Proposal detail slideover 中已屏蔽的 Apply、Archive 或运行历史头部入口。
- 不批量回填历史 archive 的 `.openspec.yaml`；reader 继续按 archive 目录位置兼容旧 metadata。

## Decisions

### 1. Archive 使用与 Apply 对称的 Chat 文本意图

在 `ChatProposalPanel.vue` 中保留 `startArchive(proposal)` 作为按钮 handler，但实现改为调用：

```ts
chatStore.sendMessage([
  {
    type: "text",
    text: `Start archiving proposal: ${changeId} (folderId: ${folderId})`,
  },
]);
```

消息必须只有一个 text part，并从 `proposal.proposalRef` 同时读取 `changeId` 与 `folderId`。现有 Chat 流水线负责把该调用持久化为当前会话的 `role=user` 消息，因此组件不手动构造 message role 或绕过 `chatStore.sendMessage`。

选择这一方式，是为了让 Agent 根据用户意图进入 Archive 阶段，并与已经采用相同模式的 Apply 入口保持一致。备选方案是在组件中继续直接调用 Archive Store，但这会维持两套运行入口，并与当前探索中的 FylloCode 运行方式冲突。

### 2. 点击消息入口后不立即修改 Proposal 状态

发送 Chat 消息只表示用户意图已经提交，不表示归档已经开始或完成。因此新的 `startArchive` 不调用 `proposalRunStore.startArchive`、`proposalStore.loadProposals` 或 `sessionStore.upsertSessionProposal`。

实际归档发生后，Main `ProposalStatusService` 继续通过现有 Workspace IPC fanout 广播 `ProposalStatusChangedPayload`。Renderer 的 `sessionStore.handleProposalStatusChanged` 根据 payload 更新或移除 Session Proposal。该链路是 Event Rail 卡片状态的事实来源。

备选方案是在 `sendMessage` 后沿用主动刷新，但消息提交时 Proposal 尚未归档，刷新会产生错误时序，甚至把旧状态再次写回卡片。

### 3. Main watcher 显式区分状态与任务元数据变化

将 watcher 的内容目标从单个 `.openspec.yaml` 文件调整为已解析的 Proposal 目录，并只处理 `.openspec.yaml` 与 `tasks.md`：

- `.openspec.yaml` 变化继续读取和解析 status，状态实际改变时发送 `changeKind: "status"`。
- `tasks.md` 变化不创造新生命周期状态，发送 watcher 当前保存的 status（通常为 `applying`）及 `changeKind: "tasks"`。
- Proposal 目录移动或消失触发 owner-qualified reconciliation，不再只通过最初 `worktreePath` 调用 `resolveChangeDirInTarget`。watch context 同时保存 owner main path、当前 target path 与 worktree mode；linked Proposal 监听当前 `openspec/changes/`，并以 owner main 的 `openspec/changes/archive/` 作为 merge 后的稳定目标。
- 任意 location watcher 的 rename、空 filename、重复事件或 error 只表示“位置可能变化”。handler 必须重新检查当前 linked 位置与 owner main archive；首次暂时找不到时进行有界延迟重试，不得立即发送 `removed`。
- linked archive 存在时可发送 `status: archived`；main archive 出现后将内容 watcher 重绑到 main，并更新当前 target。linked 随后被删除不得发送 `removed`。只有有界重试后 owner main 与当前 target 均不存在时才发送 removed。
- main archive root 尚不存在时，先监听稳定的 main `openspec/changes/`；archive root 出现后再附加目标 watcher。所有 watcher 必须在最后一个 Session 取消、Workspace 关闭或应用退出时幂等关闭。

`ProposalStatusChangedPayload` 使用必填 `changeKind: "status" | "tasks"`，复用现有 `ProposalBrowserChannels.statusChanged`。选择显式原因字段而不是让 Renderer 比较新旧 status 猜测，是为了避免初始状态事件、任务保存事件和并发状态变化产生竞态。

Renderer 收到 `changeKind: "tasks"` 时调用 `proposalStore.loadProposals()`，再按完整 `ProposalRef` 从最新 aggregate 中查找 Proposal 并 `upsertSessionProposal`。收到 `changeKind: "status"` 且 `status: archived` 时同样重新加载 aggregate，使 Proposal Store 取得 main archive 的最新 `worktreeMode/worktreePath` 后再更新 Session Proposal。加载失败或最新 aggregate 暂时找不到目标时保留旧 Session Proposal；`removed` 与其他普通 status 事件继续使用现有路径。

### 4. 可归档状态只由持久化任务完成度派生

`canArchiveProposal` 的规则调整为：Proposal status 为 `applying`、`totalTasks > 0` 且 `doneTasks === totalTasks`。`runMeta.status` 和当前 run 是否匹配均不再参与判断。

`ProposalDetailHeader.vue` 与 `ChatProposalPanel.vue` 已共同调用 `getProposalDisplayStatus`，因此只修改共享 selector 即可让 Slideover badge 与 Event Rail badge/归档按钮使用同一规则。将规则存为可写 Store 属性会复制可派生状态，并且单个布尔值无法表示多个 `ProposalRef`，因此不采用。

### 5. 两个生命周期入口统一为纯文字按钮

“开始实现”继续保持当前无 icon 的 `UButton`；“归档”移除 `i-lucide-archive`。两个按钮的中文操作文案已经能够独立表达意图，且点击只发送消息，不再使用 play/archive icon 暗示组件直接执行操作。

备选方案是给“开始实现”恢复 play icon 以匹配 Archive，但图标语义与新的 Chat 意图入口不一致，也违背用户此前移除 Apply icon 的决定。

### 6. 旧组件实现只注释，不删除或迁移

将旧的直接 Archive handler 与仅因该 handler 存在的 `useWorkspaceStore`、`workspaceStore`、`workspaceId` 等组件内引用使用 `//` 注释保留，并在相邻位置写明：`Proposal 运行入口待重构，方案确定后恢复或删除。` 不使用 TODO，不通过 lint-disable 规避 unused 校验，也不新增开关。

`proposalRunStore`、`proposalStore` 和 `sessionStore` 如果仍被状态展示或“查看详情”同步逻辑使用，则保持活动引用，不机械注释。底层文件完全不删除。

### 7. Archive 成功后显式持久化 archived metadata

`fyllo-specs archive-change` 仅在 OpenSpec CLI 输出通过 `parseArchiveOutcome` 确认为 success 后，读取 `archiveTarget/.openspec.yaml`，保留现有 metadata 并将 `status` 写为 `archived`。写回发生在 `finalizeArchiveWorkspace` 之前，因此 main mode 的最终 commit或 linked mode 的 proposal branch commit都会包含该状态，merge 后 main archive 无需二次修补。

Preview、archive target conflict、CLI failure、已知 early-return signal或 success marker 缺失均不得写入 metadata。写回应保持幂等；文件已经是 `status: archived` 时结果不变。历史 archive 不做批量迁移，Main reader 继续使用 archive 目录位置覆盖旧文件中的 applying status。

状态字段写回不能替代 watcher relocation：linked archive 可能在 Main watcher 处理文件事件前被 commit、merge并随 worktree 删除，因此 watcher 仍须以 owner main archive 作为稳定重定位目标。

### 8. Metadata 写入失败视为 Archive 部分成功

OpenSpec archive success marker 已确认后，目录移动与 spec sync 已经发生，metadata 写入失败不得被包装成“OpenSpec archive 未发生”，也不得提示 Agent重新执行 archive。Tool state 保留 `archive.ok: true`、`archiveTarget` 与 `archiveRawOutput`，顶层结果标为 failed，Git finalization 不启动；既有 finalization error/recovery envelope返回 `archive-metadata-update-failed`，说明先修复归档目录内 metadata，再从 commit、merge和 cleanup 继续。

该失败路径不新增 Proposal lifecycle status或 IPC channel。它只扩展 Archive tool 的错误/恢复语义，确保磁盘事实、tool报告和后续操作一致。

## Risks / Trade-offs

- [风险] 用户点击“归档”后卡片不会立即进入“归档中”，因为 Chat Agent 尚未真正执行 Archive。→ 保持当前状态直到 Main watcher 推送真实变化，避免展示虚假运行状态。
- [风险] Archive 按钮发送消息后不立即 reload，任务计数只在真实 `tasks.md` 变化后刷新。→ 由 Main tasks 事件触发 aggregate reload；消息提交本身不制造尚未发生的状态变化。
- [风险] 一次 `tasks.md` 保存可能产生多个文件系统事件。→ Main 仅按目标文件名处理，Renderer 的 `loadGeneration` 继续拒绝迟到 aggregate 结果；测试覆盖重复事件不破坏最终 Session Proposal。
- [风险] 任务元数据刷新失败可能使卡片短暂保留旧计数。→ 保留旧卡片，不将读取失败误判为 removed；后续文件事件、打开 Slideover 或页面加载可再次刷新。
- [风险] linked archive、merge-to-main 与 worktree-remove 连续发生，单个 `fs.watch` 事件可能合并、缺少 filename或在旧路径删除后报错。→ 所有 location 事件只触发 owner-qualified reconciliation；main archive 为稳定落点，旧 target 消失先重试并查 main，不能直接 removed。
- [风险] merge或后续 cleanup失败时 Proposal 已经进入 linked archive。→ 按当前语义展示 `archived`，失败与恢复信息由 Chat/tool state承载；本变更不新增“归档中/归档失败”生命周期状态。
- [风险] OpenSpec archive 成功后 metadata 写入失败。→ 保留 archive 已完成事实与目标，停止 Git finalization，返回不可重跑 archive 的显式恢复指引。
- [风险] 历史 archive metadata仍为 applying。→ Reader继续以 archive location派生 archived；只保证未来 fyllo-specs archive持久化一致状态，不制造大范围历史文件变更。
- [风险] 注释保留的旧实现可能随未来重构失效。→ 注释明确恢复或删除条件，活动行为由聚焦组件测试约束；不把旧代码视为当前契约。
- [风险] Chat 消息字符串是 Agent-facing 文本契约。→ 在 delta spec 与组件测试中精确断言完整字符串及单 text part。

## Migration Plan

1. 更新组件 handler 与按钮 icon，注释保留旧直接 Archive 实现。
2. 扩展 watcher payload 与 Main 目录监听，让 `tasks.md` 变化通过现有 IPC channel 到达 Renderer。
3. 更新 Session Store 的任务事件刷新与共享 `archiveReady` selector。
4. 将 Main watcher 扩展为 owner main锚定的跨 worktree reconciliation，并让 Renderer在 archived status事件上刷新 aggregate。
5. 在 OpenSpec archive确认成功后、Git finalization前写回 `status: archived`，补充部分成功恢复状态。
6. 更新 Main/Renderer/MCP聚焦测试，运行 Node/Web typecheck、lint与格式检查。

回滚时可恢复已注释的直接 Archive handler 与相关引用，并恢复 Archive icon；底层能力未被删除，不需要数据迁移。

## Open Questions

无。当前接受 `archived` 只表示 OpenSpec archive 已成功，不保证后续 Git merge/worktree cleanup 全部成功；未来 Proposal 运行模型若需要展示 finalization 进度或失败状态，再通过独立契约扩展。注释保留的旧运行入口届时一并决定恢复或删除。
