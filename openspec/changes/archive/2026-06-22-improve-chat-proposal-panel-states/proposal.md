## Why

`ChatProposalPanel` 当前把 proposal 生命周期状态直接作为卡片展示状态，无法表达
`applying` 但 apply run 已完成的“可归档”阶段；同时部分状态下没有稳定的详情入口，archive 完成后也可能继续显示
“实施中 + 归档”。这会让用户误判 proposal 当前所处阶段，并增加从 Chat 返回详情页的操作成本。

## What Changes

- 在 Chat EventRail 的 proposal 卡片中引入派生展示态：`creating`、`draft`、`applying`、`archiveReady`、`archived`。
- 当 proposal 仍为 `applying` 但对应 apply run 已完成时，卡片右上角 badge 显示“可归档”，并展示“归档”入口。
- 点击“归档”后，在 archive stream 运行期间卡片右上角 badge 显示“归档中”，避免继续显示“实施中”。
- 除 `creating` 外，proposal 卡片始终展示“查看详情”入口；`draft` 可同时展示“开始实现”，`archiveReady` 可同时展示“归档”。
- archive 成功后刷新并回写当前 session 的 proposal 元数据，使 Rail 及时显示“已归档”，且不再展示“归档”按钮。
- 暂不把 session 关联的 proposal 写入 session meta；继续以 lineage 作为 session-proposal 关联的持久来源。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-event-rail-proposal-status`: 修改 Chat EventRail 中 proposal 卡片的展示态、详情入口与 archive 后状态同步要求。
- `chat-event-rail-panel-style`: 修改卡片操作区约束，确保非 creating 状态下详情入口始终可见。

## Impact

- 影响 `src/renderer/src/components/chat/event/ChatProposalPanel.vue` 的 badge 与按钮渲染逻辑。
- 影响 renderer 侧 session/proposal run 状态编排，可能涉及 `src/renderer/src/stores/session.ts` 与 `src/renderer/src/stores/proposal-run.ts`。
- 影响组件测试 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`，需要补充“可归档”、详情入口和 archive 后状态回写场景。
- 不修改共享 `ProposalStatus` 类型、IPC channel、session meta 存储格式或 lineage 持久化模型。
