## MODIFIED Requirements

### Requirement: Static governance area summarizes health and evolution

系统 SHALL 在静态治理区域展示治理健康、规约增长和准则演化。

#### Scenario: Governance health summarizes existing stats

- **WHEN** overview 页面展示静态治理区域
- **THEN** 治理健康 SHALL 使用现有 `OverviewStats` 数据展示项目治理摘要
- **AND** 治理健康 SHALL 突出展示溯源覆盖率，覆盖率由 `taskLinkedRatio` 派生
- **AND** 治理健康 SHALL 囊括能力规约数量、归档提案数量、项目准则数量和溯源覆盖信息
- **AND** 项目准则数量 SHALL 按 `guidelines/**/*.md` 递归统计

#### Scenario: Existing stat navigation remains available

- **WHEN** 用户点击治理健康中的能力规约入口
- **THEN** 系统 SHALL 导航到 `/specs`
- **AND** 当用户点击治理健康中的归档提案入口
- **THEN** 系统 SHALL 导航到 `/proposal`
- **AND** 当用户点击治理健康中的项目准则入口
- **THEN** 系统 SHALL 导航到 `/guidelines`

#### Scenario: Governance evolution content remains visible

- **WHEN** overview 页面展示静态治理区域
- **THEN** 规约增长 SHALL 展示 `governance.specsGrowth` 的累计趋势
- **AND** 准则演化 SHALL 展示 `governance.recentGuidelines` 的最近更新列表或对应空状态
