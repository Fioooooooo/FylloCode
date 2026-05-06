## REMOVED Requirements

### Requirement: Pipeline 页面在共享应用外壳内渲染

**Reason**: 当前项目作用域页面由工作流路由表达。

**Migration**: 删除 `openspec/specs/pipeline-page/`，使用 `app-shell-routing`、`project-page-routing` 和 `workflow-templates` 描述当前工作流页面。

### Requirement: Pipeline 页面采用两区域布局

**Reason**: 当前工作流页面布局由工作流模板相关规范表达。

**Migration**: 删除 `openspec/specs/pipeline-page/`，使用 `workflow-templates` 描述当前工作流模板页面布局。

### Requirement: Pipeline 侧边栏支持在运行和模板之间切换标签

**Reason**: 当前工作流页面不包含运行和模板标签切换需求。

**Migration**: 删除该需求，不创建对应工作流运行标签需求。
