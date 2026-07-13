# Workflow Editor

状态：未来重组方向，仅作边界留存；当前生产代码尚未迁入本目录。

## 目标

把工作流模板浏览、YAML 文档模型、stage 编辑命令和编辑器 UI 收敛为 `workflow-editor` 能力，避免编辑规则继续分散在页面、composable、utils 和组件中。

## 当前来源

- `src/renderer/src/pages/workflow.vue`
- `src/renderer/src/components/workflow/**`
- `src/renderer/src/composables/useWorkflowEditor.ts`
- `src/renderer/src/utils/workflow.ts`

## 预期边界

- `model`：workflow YAML 解析/序列化、stage template、纯校验和不可变编辑操作。
- `application`：模板选择、新建、保存、删除和 editor session 编排。
- `ui`：WorkflowSidebar、WorkflowDetail、StageList、StageCard、YamlEditor。
- `integration`：仅在确有 route/编辑器宿主适配时建立，不为目录完整性创建空层。
- `pages/workflow.vue` 最终只保留页面布局和 feature 挂载。

## 保持在 feature 外

- `src/renderer/src/api/automation/workflow.ts`
- `src/renderer/src/stores/automation/workflow.ts`
- `src/shared/types/workflow.ts`

迁移时必须遵守 `guidelines/RendererFeatures.md`，先建立回归测试和公共入口，不在文件重排中改变 YAML 格式或用户行为。
