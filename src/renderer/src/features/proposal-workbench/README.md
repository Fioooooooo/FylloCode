# Proposal Workbench

状态：未来重组方向，仅作边界留存；当前生产代码尚未迁入本目录。

## 目标

收拢 proposal 浏览、详情文件加载、spec delta 展示、apply/archive 操作和 slideover 生命周期，让页面与 SFC 不再直接承载请求竞态和多 store 用例编排。

## 当前来源

- `src/renderer/src/pages/proposal.vue`
- `src/renderer/src/components/proposal/**`
- `src/renderer/src/composables/useProposalDetailSlideover.ts`
- `src/renderer/src/utils/proposal-display-status.ts`

## 预期边界

- `model`：display status、可执行/可归档谓词、detail tab 投影。
- `application`：proposal detail query、请求竞态、apply/archive workbench controller。
- `ui`：ProposalDetailSlideover、header、markdown/spec delta content、run side panel。
- `integration`：overlay 打开入口，以及 Chat EventRail 到 proposal detail 的桥接。
- `pages/proposal.vue` 最终只负责 route 页面布局、筛选入口和 feature 挂载。

## 保持在 feature 外

- `src/renderer/src/api/proposal/**`
- `src/renderer/src/stores/proposal/**`
- proposal IPC/shared contracts

迁移前应先拆出 `ProposalDetailSlideover.vue` 中的文件读取和多 store 编排，并保持 apply/archive 的现有行为契约不变。
