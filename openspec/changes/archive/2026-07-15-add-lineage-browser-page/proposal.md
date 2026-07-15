## Why

FylloCode 已经持久化任务、会话、Plan、Proposal 与归档 Commit 之间的 lineage，但当前只在 Overview 展示最近五条摘要，用户无法浏览全部工作脉络或沿演进路径下钻。现有 `/lineage` 静态稿已经验证了主从布局和信息层级，现在需要把它正式接入真实项目数据，并从 Overview 提供稳定入口。

## What Changes

- 新增项目级工作脉络浏览能力：按最近更新时间列出全部 lineage subject，并展示任务或对话来源、关联状态、会话/Plan/Proposal 数量和聚合进度状态。
- 新增 lineage 详情投影：按会话分组展示 Session、Plan、Proposal 与 Commit 的演进路径，并补充现有会话标题和 Proposal 实时状态。
- 将 `/lineage` 页面从本地 mock 数据切换为 `insight.lineage` store/API 数据，保留已确认的双栏布局与“全部 / 推进中 / 已归档 / 待关联”筛选。
- 复用现有应用内入口打开会话和 Proposal，并从任务起点导航到任务页；Commit 节点展示并允许复制短 SHA，不在本次变更中新增任务深链或 Git diff 浏览器。
- 在 Overview 治理健康入口网格末尾提供“工作脉络”入口，显示项目 lineage subject 总数并导航到 `/lineage`。
- 为列表、详情、项目切换、空数据、局部元信息缺失和请求失败补充明确且相互隔离的加载/错误/回退状态。
- 不修改现有 lineage subject/index 的磁盘存储格式，不新增持久化迁移，也不提供手工合并、删除或重新绑定脉络的编辑能力。

## Capabilities

### New Capabilities

- `lineage-browser`: 定义项目级工作脉络的列表、筛选、详情时间轴、对象下钻及加载/空/错误状态。

### Modified Capabilities

- `project-overview`: 在治理健康入口网格末尾增加工作脉络入口，显示 subject 总数并导航到 `/lineage`。

## Impact

- Shared/IPC：扩展 `src/shared/types/lineage.ts`、`src/shared/ipc/insight/lineage.channels.ts` 与 `src/shared/ipc/insight/lineage.schemas.ts`，新增只读 browser 查询契约。
- Main/Preload：扩展 `src/main/services/insight/lineage/` 的 browser 投影、`src/main/ipc/insight/lineage.ts`、`src/preload/api/insight/lineage.ts`，复用 session meta、OpenSpec proposal metadata 和现有 lineage storage，不改变持久化 schema。
- Renderer：扩展 `src/renderer/src/api/insight/lineage.ts`、`src/renderer/src/stores/insight/lineage.ts`，将 `src/renderer/src/pages/lineage.vue` 的 mock 数据替换为真实查询，并复用 `useOpenChatSession`、Proposal detail slideover、task navigation 和共享 UI 组件。
- Overview：调整 `src/renderer/src/components/overview/OverviewStatsBar.vue` 及相关页面测试，保留现有三列入口网格和其他治理入口行为。
- 测试：覆盖 main service、IPC、preload、shared schema、renderer store/page 与 Overview 导航；不引入新依赖。
