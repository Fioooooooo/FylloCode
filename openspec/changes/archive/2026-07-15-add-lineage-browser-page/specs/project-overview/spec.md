## ADDED Requirements

### Requirement: Governance health links to the lineage browser

系统 SHALL 在 Overview 治理健康卡片的入口网格末尾展示工作脉络入口。

#### Scenario: 工作脉络入口展示项目 subject 总数

- **WHEN** overview 页面成功加载 `OverviewStats`
- **THEN** 工作脉络入口 SHALL 显示 `totalSubjects` 的不带单位数字
- **AND** 入口 SHALL 位于能力规约、归档提案、项目准则和知识沉淀之后
- **AND** 入口 SHALL 与其他治理入口使用相同的可点击视觉模式

#### Scenario: 用户打开工作脉络页面

- **WHEN** 用户点击 Overview 治理健康中的工作脉络入口
- **THEN** 系统 SHALL 导航到 `/lineage`
- **AND** 其他治理入口的顺序与导航行为 SHALL 保持不变
