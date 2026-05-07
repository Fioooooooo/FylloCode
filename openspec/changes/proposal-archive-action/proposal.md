## Why

Proposal 详情页已经能启动 apply，但 apply 完成后还缺少一个明确的“归档”入口。归档需要继续复用已完成的 ACP session，这样用户可以在同一条上下文里完成收尾、同步 spec 和提交变更。

## What Changes

- 在 proposal 详情页 header 增加“归档”按钮，仅在 apply 已完成时显示
- 新增 archive IPC 流，复用已完成的 apply stage ACP session
- 将 archive 抽象成独立的一阶段流，使用与 workflow stage 相同的 streaming 处理方式
- 在 stage runner 策略中新增 `proposal-archive` 类型，集中构造归档 prompt
- 归档完成后刷新 proposal 元数据，让详情页和列表反映最新文件状态

## Capabilities

### New Capabilities

- `proposal-archive-action`: proposal 在 apply 完成后可继续进入归档流程，复用现有 ACP session 完成归档与提交

### Modified Capabilities

- `proposal-detail`: 详情页 header 需要在 apply 完成后展示归档按钮
- `proposal-ipc`: 需要新增 archive IPC 与对应的 streaming 通道

## Impact

- `electron/main/ipc/proposal-apply.ts`
- `electron/main/ipc/proposal-apply/stage-runners.ts`
- `shared/types/workflow.ts`
- `shared/types/channels.ts`
- `electron/preload/api/proposal.ts`
- `frontend/src/api/proposal.ts`
- `frontend/src/stores/proposal-run.ts`
- `frontend/src/components/proposal/ProposalDetailHeader.vue`
- `frontend/src/pages/proposal/[id].vue`
