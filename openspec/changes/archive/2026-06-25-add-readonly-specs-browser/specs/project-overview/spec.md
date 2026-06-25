## MODIFIED Requirements

### Requirement: 概览页归档提案卡提供提案列表入口

概览页 `OverviewStatsBar` 中的「归档提案」统计卡（`key: "archives"`）SHALL 为可点击交互元素，点击后路由跳转至 `/proposal` 列表页。概览页 `OverviewStatsBar` 中的「能力规约」统计卡（`key: "specs"`）SHALL 为可点击交互元素，点击后路由跳转至 `/specs` 只读能力规约浏览页。这两个可点击卡片 SHALL 提供一致的 hover 视觉反馈与无障碍语义（可聚焦、键盘可触发）。「项目准则」与「溯源覆盖」统计卡 SHALL 保持纯展示，无点击交互。

#### Scenario: 点击归档提案卡进入列表页

- **WHEN** 用户点击概览页 `OverviewStatsBar` 的「归档提案」统计卡
- **THEN** 路由跳转至 `/proposal` 列表页

#### Scenario: 点击能力规约卡进入 specs 浏览页

- **WHEN** 用户点击概览页 `OverviewStatsBar` 的「能力规约」统计卡
- **THEN** 路由跳转至 `/specs` 只读能力规约浏览页

#### Scenario: 其他统计卡无跳转

- **WHEN** 用户点击「项目准则」或「溯源覆盖」统计卡
- **THEN** 不触发路由跳转
