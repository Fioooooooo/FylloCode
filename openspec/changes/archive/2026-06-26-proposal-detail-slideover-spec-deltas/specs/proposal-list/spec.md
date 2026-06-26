## ADDED Requirements

### Requirement: Proposal 列表页作为顶层 /proposal 路由

系统 SHALL 将 proposal 列表页实现为 `src/renderer/src/pages/proposal.vue` 对应的顶层 `/proposal` 路由。系统 SHALL NOT 为 proposal 列表保留仅渲染 `RouterView` 的 `src/renderer/src/pages/proposal.vue` 空壳，也 SHALL NOT 继续依赖 `src/renderer/src/pages/proposal/index.vue` 作为嵌套路由入口。

#### Scenario: 访问 proposal 列表

- **WHEN** 用户导航到 `/proposal`
- **THEN** 应用在共享应用外壳内渲染 proposal 列表页
- **AND** 渲染组件来自 `src/renderer/src/pages/proposal.vue`

#### Scenario: 删除嵌套路由空壳

- **WHEN** 应用生成文件系统路由
- **THEN** 不生成 `/proposal/` 嵌套路由记录
- **AND** 不生成 `/proposal/:id` 详情路由记录

### Requirement: Proposal 列表卡片打开详情 Slideover

Proposal 列表卡片 SHALL 保持现有元数据展示与筛选行为，但点击卡片时 SHALL 通过 programmatic overlay 打开 proposal 详情 Slideover，而不是执行路由跳转。

#### Scenario: 点击 proposal 卡片

- **WHEN** 用户点击 proposal 列表中的 proposal 卡片
- **THEN** 应用调用 proposal 详情 Slideover 打开入口，并传入该卡片的 `proposal.id`
- **AND** 当前路由保持 `/proposal`
- **AND** `router.push('/proposal/<id>')` SHALL NOT 被调用

#### Scenario: creating 状态 proposal 仍可打开

- **WHEN** 用户点击 `status === "creating"` 的 proposal 卡片
- **THEN** 应用仍打开 proposal 详情 Slideover
- **AND** Slideover 在缺少 markdown 文件时展示已有空态或 loading/error 状态
