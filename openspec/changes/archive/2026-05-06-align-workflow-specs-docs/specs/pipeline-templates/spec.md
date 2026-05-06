## REMOVED Requirements

### Requirement: 模板标签显示可用模板

**Reason**: 当前模板能力由 `workflow-templates` 表达。

**Migration**: 删除 `openspec/specs/pipeline-templates/`，使用 `openspec/specs/workflow-templates/` 作为当前模板需求来源。

### Requirement: 模板卡片支持悬停操作

**Reason**: 当前工作流模板列表没有悬停才出现的模板操作需求。

**Migration**: 删除该需求，不在当前工作流模板规范中保留对应操作。

### Requirement: 选择模板打开编辑器视图

**Reason**: 当前模板选择行为由 `workflow-templates` 表达。

**Migration**: 删除 `openspec/specs/pipeline-templates/`，使用 `openspec/specs/workflow-templates/` 作为当前模板需求来源。

### Requirement: 新建模板按钮位于自定义分组标题行

**Reason**: 当前新建模板入口由 `workflow-templates` 表达。

**Migration**: 删除 `openspec/specs/pipeline-templates/`，使用 `openspec/specs/workflow-templates/` 作为当前模板需求来源。

### Requirement: 模板编辑器支持阶段配置

**Reason**: 当前工作流模板编辑器以 YAML 为唯一数据源，不提供表单式阶段配置需求。

**Migration**: 删除该需求，使用 `workflow-editor` 和 `workflow-templates` 中的 YAML 编辑与 YAML 渲染预览要求。

### Requirement: 模板编辑器支持保存和取消

**Reason**: 当前保存与取消行为由 `workflow-templates` 表达。

**Migration**: 删除 `openspec/specs/pipeline-templates/`，使用 `openspec/specs/workflow-templates/` 作为当前模板需求来源。
