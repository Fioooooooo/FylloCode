---
sidebar:
  group: 产品功能
  order: 68
---

# 工作脉络

工作脉络页面用于浏览当前项目的全部 lineage subject，回答一项工作从哪里开始、经过哪些 Chat 会话和 Plan、形成了哪些 Proposal，以及最终关联到哪个 Commit。页面读取项目本地数据，不会修改 lineage、Session、Plan 或 Proposal 文件。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/lineage.png" alt="工作脉络页面截图" />
</figure>

从[项目概览](/docs/features/overview)治理健康卡片中的「工作脉络」进入 `/lineage`。该页面不占用 ActivityBar 一级入口。

## 浏览与筛选

左侧列表按最近更新时间从新到旧排列全部脉络，并提供四种筛选：

| 筛选 | 显示范围 |
| --- | --- |
| 全部 | 当前项目的全部工作脉络 |
| 推进中 | 状态不是「已归档」的脉络 |
| 已归档 | 至少有一个 Proposal，且所有关联 Proposal 都已归档的脉络 |
| 待关联 | 尚未关联任务的脉络 |

当前版本不提供文本搜索。切换筛选后，如果原先选中的脉络不再可见，页面会选择第一条可见结果；没有匹配项时显示筛选空状态。

## 聚合状态

列表使用统一规则把一个 subject 下的 Plan 和 Proposal 聚合为四种状态：

- **实现中**：至少一个 Proposal 正在 Apply。
- **已规划**：存在正在创建、草稿或状态暂不可用的 Proposal，或至少一个 Plan。
- **已归档**：至少有一个 Proposal，且所有 Proposal 都已归档。
- **讨论中**：还没有 Plan 或 Proposal。

状态始终同时显示文字和图标，不只依赖颜色。

## 演进详情

右侧详情先显示任务或对话起点，再按 Session 分组展示：

- Session 标题、Agent 和时间；
- Plan 的 slug、目标和 `draft` / `approved` 状态；
- Proposal 的 change ID、标题和实时状态；
- Proposal 已关联的 Commit hash。

可以打开关联 Chat 会话和 Proposal 详情，从任务起点进入任务看板，或复制完整 Commit hash。Plan 在此页面只读；查看任务会进入 `/task`，但不会自动打开某一张任务卡。

如果 Session、Plan 或 Proposal 的补充元信息缺失，页面仍保留稳定 ID，并禁用依赖缺失信息的操作。单个引用缺失不会阻止其他工作脉络显示。

## 数据与限制

- 数据来自现有 lineage subject、Session meta、Plan 文档和 Proposal metadata 的只读投影。
- 页面没有创建、删除、合并、拆分或重新绑定脉络的操作。
- 打开页面或切换项目时会重新加载数据；旧项目的迟到响应不会覆盖当前项目。
- 顶层查询失败时显示页面级错误，不把不完整结果当作成功数据。
- 现有项目不需要执行数据迁移。

关于 subject 如何建立、任务如何补建以及数据如何存储，见 [Lineage 追溯链路](/docs/guide/lineage)。
