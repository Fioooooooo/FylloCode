## MODIFIED Requirements

### Requirement: Static governance area summarizes health and evolution

系统 SHALL 在静态治理区域展示治理健康、知识沉淀、规约增长和准则演化。

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
- **AND** 当用户点击治理健康入口网格中的知识沉淀入口
- **THEN** 系统 SHALL 导航到 `/knowledge`

#### Scenario: Knowledge summary remains independently visible

- **WHEN** knowledge browser index 成功加载
- **THEN** 治理健康卡片 SHALL 在首个分隔线下以每排三个入口的网格展示治理入口
- **AND** 知识沉淀 SHALL 与能力规约、归档提案和项目准则使用相同入口样式，并以不带单位的数字展示 browser index 中正常条目与扫描错误的总数
- **AND** 当至少一个条目为 `suspect`、`unknown` 或存在扫描错误时，入口 SHALL 将这些条目与错误计入需要关注的数量，并使用不带“条”的文字提示
- **AND** 条目状态 SHALL NOT 只通过颜色表达

#### Scenario: Knowledge summary loading or failure is isolated

- **WHEN** knowledge browser index 正在加载或加载失败
- **THEN** 知识沉淀入口 SHALL 分别展示加载状态或“暂不可用”状态
- **AND** 入口 SHALL 继续允许用户导航到 `/knowledge` 查看详细状态
- **AND** knowledge browser index 失败 SHALL NOT 让 overview 主数据进入页面级错误状态
- **AND** SHALL NOT 隐藏进行中提案、最近脉络、规约增长或准则演化

#### Scenario: Governance evolution content remains visible

- **WHEN** overview 页面展示静态治理区域
- **THEN** 规约增长 SHALL 展示 `governance.specsGrowth` 的累计趋势
- **AND** 准则演化 SHALL 展示 `governance.recentGuidelines` 的最近更新列表或对应空状态
