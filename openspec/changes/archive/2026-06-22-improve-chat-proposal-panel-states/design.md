## Context

`ProposalMeta.status` 只表达 OpenSpec 生命周期：`creating`、`draft`、`applying`、`archived`。
用户在 Chat EventRail 中看到的卡片状态还需要结合 apply run 状态判断：当
`ProposalMeta.status === "applying"` 且对应 `ApplyRunMeta.status === "done"` 时，用户真正可以执行的是 archive。

当前 `ChatProposalPanel` 直接用 `proposal.status` 渲染 badge，并用全局 `proposalRunStore.runMeta`
判断是否显示“归档”。这导致三个问题：可归档时 badge 仍显示“实施中”；归档按钮与查看详情按钮互斥；
archive 完成后如果 `sessionProposals` 未及时收到 archived 元数据，卡片会继续显示旧的 applying 状态。

现有 lineage 已持久化 session-proposal 关联，`useSessionStore.backfillSessionProposals()` 会在切换 session 时通过
`lineageApi.getBySession()` 回填。因此本 change 不引入 session meta 双写。

## Goals / Non-Goals

**Goals:**

- 为 Chat EventRail proposal 卡片提供独立于 `ProposalStatus` 的展示态派生。
- 让 `applying + apply run done` 在卡片上显示为“可归档”。
- 让用户点击“归档”后，archive stream 运行期间在卡片上显示“归档中”。
- 让除 `creating` 外的所有 proposal 卡片都有“查看详情”入口。
- archive 成功后刷新 proposal 元数据并回写当前 session proposal，避免继续显示“实施中 + 归档”。

**Non-Goals:**

- 不新增或修改 `ProposalStatus` 联合类型。
- 不修改 IPC channel 或主进程存储格式。
- 不把 proposal id 列表写入 session meta；继续使用 lineage 做重启恢复。
- 不在 Chat EventRail 展示 apply/archive 流式日志、阶段进度或工具调用详情。

## Decisions

1. **展示态在 renderer 派生，不写入共享类型。**
   - 选择：在 `ChatProposalPanel` 或邻近 composable 中定义局部 `displayStatus`，值包含 `archiveReady` 与 `archiving`。
   - 理由：`archiveReady` 是 UI 层由 proposal 生命周期与 apply run 状态组合得出的操作态，不是 OpenSpec `.openspec.yaml` 的持久状态。
   - 替代方案：扩展 `ProposalStatus`。拒绝，因为这会混淆 OpenSpec 生命周期与运行态。

2. **操作按钮从互斥链改为组合渲染。**
   - 选择：`creating` 不展示操作；其他状态始终展示“查看详情”；`draft` 额外展示“开始实现”；`archiveReady` 额外展示“归档”。
   - 理由：用户应始终能从 Chat 直接进入详情页查看 proposal 内容或运行历史，不需要绕到概览页。
   - 替代方案：点击整个卡片进入详情。可以作为补充，但不能替代显式按钮，因为现有 UI 已使用按钮表达操作入口。

3. **archive 完成后主动同步当前 session proposal。**
   - 选择：`startArchive` 成功后刷新 `useProposalStore.loadProposals()`，并把刷新后的完整 `ProposalMeta` 回写当前 session 的 `sessionProposals`；如果 archived id 变为 `YYYY-MM-DD-<changeId>`，应使用刷新列表中匹配原始 changeId 或去归档前缀后匹配的 archived proposal。
   - 理由：只依赖 file watcher/statusChanged 容易受目录移动时机与旧 id 影响；主动刷新能保证当前操作后的 Rail 立即收敛。
   - 替代方案：只等待 `proposal:statusChanged`。拒绝，因为用户已观察到 archive 后仍显示旧状态。

4. **本 change 不处理额外重启恢复增强。**
   - 选择：继续依赖 lineage 回填 session-proposal 关联，不新增 session meta 字段。
   - 理由：lineage 已是持久事实来源；双写会引入一致性问题。若后续使用中发现 archived id 回填或 run 摘要恢复有缺口，再开独立修复。

## Risks / Trade-offs

- [风险] `archiveReady` 依赖当前 renderer 能拿到对应 apply run 状态，历史 session 中可能仍显示“实施中”。→ [缓解] 本 change 优先解决当前操作路径；若实际使用发现历史恢复缺口，再做按 proposal 加载 run 摘要的专项。
- [风险] archive 后刷新 proposal 列表可能失败。→ [缓解] 保留现有 statusChanged 路径作为兜底；刷新失败时不破坏当前内存状态，并记录/暴露错误由现有错误路径处理。
- [风险] 同一 session 多 proposal 时全局 `runMeta` 只代表当前 run。→ [缓解] `archiveReady` 与 `archiving` 判定必须要求 `runMeta.changeId === proposal.id`，避免串扰；多 proposal 历史 run 摘要恢复不纳入本 change。
