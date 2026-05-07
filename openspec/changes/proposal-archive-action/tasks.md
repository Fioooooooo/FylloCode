## 1. OpenSpec 与共享类型

- [x] 1.1 补齐 `proposal-archive-action` 的 proposal / design / spec / tasks 文档，并将 change 状态切到实施中以继续开发
- [x] 1.2 在 `shared/types/workflow.ts` 增加 `proposal-archive` stage type
- [x] 1.3 在 `shared/types/channels.ts` 与 preload / renderer API 中补齐 archive IPC 通道

## 2. Main 进程归档流

- [x] 2.1 在 `electron/main/ipc/proposal-apply/stage-runners.ts` 增加 `proposal-archive` prompt 策略
- [x] 2.2 在 proposal IPC 中实现 archive handler，复用已完成 apply stage 的 ACP session 并通过 MessagePort 流式输出
- [x] 2.3 在归档完成后刷新 proposal 元数据，确保 UI 能看到 `archived` 状态

## 3. 详情页与 Store

- [x] 3.1 在 `frontend/src/components/proposal/ProposalDetailHeader.vue` 增加归档按钮显示条件与点击事件
- [x] 3.2 在 `frontend/src/stores/proposal-run.ts` 增加 archive pseudo-run 驱动逻辑
- [x] 3.3 在 `frontend/src/pages/proposal/[id].vue` 接入归档触发、归档完成后刷新 proposal 元数据

## 4. 验证

- [x] 4.1 运行 `pnpm typecheck`，确认 archive 流和 proposal 详情页无类型回归；当前无现成自动化测试覆盖该链路
