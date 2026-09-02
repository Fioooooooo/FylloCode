# Workflow Editor

当前页面直接编辑 Workspace-owned v2 workflow definition。它不是旧的 stage/template 编辑模型，也不维护 built-in/custom 两套来源。

## 当前边界

- `src/renderer/src/pages/workflow.vue`：页面布局和用户操作入口。
- `src/renderer/src/components/workflow/YamlEditor.vue`：纯文本 YAML 编辑器。
- `src/renderer/src/stores/automation/workflow.ts`：按 `workflowId` 管理 definition 列表、选中项、原始 YAML、保存/删除和请求 generation。
- `src/renderer/src/api/automation/workflow.ts`：definition CRUD API；请求仍属于 `automation:workflow:*` domain。
- `src/shared/types/workflow.ts`：Main、Preload 和 Renderer 共用的 v2 definition contract。

保存新 definition 时由 Main 分配随机 `workflowId`。编辑 `name` 会更新同一份 Workspace definition，不会创建新目录；所有 definition 使用相同的保存和删除规则。YAML 结构错误由 definition API 返回，Phase 1 执行能力则由 Main WorkflowEngine 在 trigger 前单独 preflight。

## 与 Run Inspector 的分工

Workflow Editor 只负责 definition CRUD，不读取或写入 Run snapshot，也不触发执行。Run 状态、人工决策、fresh Agent transcript 和 Action output 由 `workflow-run-inspector` 通过独立的 `workflow-run` store、wake/pull IPC 和 Chat activity entry 展示。

## 不属于这里的兼容语义

应用不提供 built-in workflow 资源、只读保护、copy-on-save、全局 staging 或旧名称型 loader。旧全局文件保持 inert；feature 不应重新引入这些来源或按 name 生成路径。

新增或调整页面行为时遵守 `guidelines/RendererFeatures.md` 和 `guidelines/UiDesign.md`，先更新 feature 测试与公共入口，再修改 UI。
