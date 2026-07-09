## MODIFIED Requirements

### Requirement: Proposal page presents the complete proposal list

系统 SHALL 将 `/proposal` 页面作为当前项目 proposal 的完整列表入口，不再在页面顶部展示本地统计卡或状态 tabs。

#### Scenario: Loaded proposal list is shown without local status filtering

- **WHEN** 用户打开 `/proposal` 且 `proposal:browser:list` 返回多个不同状态的 proposal
- **THEN** 页面 SHALL 展示返回列表中的完整 proposal 集合
- **AND** 页面 SHALL NOT 展示页面级 proposal 数量统计卡
- **AND** 页面 SHALL NOT 展示用于按 proposal 状态过滤列表的 tabs

#### Scenario: Proposal card still opens proposal detail

- **WHEN** 用户点击 `/proposal` 页面中的 proposal 卡片
- **THEN** 系统 SHALL 使用该 proposal 的 `id` 打开现有 proposal detail slideover
- **AND** 系统 SHALL NOT 导航到新的 proposal 子路由或内嵌详情 pane

#### Scenario: Empty proposal list remains explicit

- **WHEN** `/proposal` 页面加载成功且 `proposal:browser:list` 返回空列表
- **THEN** 页面 SHALL 展示 proposal 空状态
- **AND** 空状态 SHALL NOT 说明用户需要切换筛选条件
