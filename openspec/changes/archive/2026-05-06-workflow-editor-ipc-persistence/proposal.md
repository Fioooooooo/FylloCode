## Why

Workflow 页面目前是纯原型：模板数据硬编码在组件内，无持久化、无 IPC、无语法高亮编辑器，无法支撑真实使用。需要在原型验证完成后将其升级为可用的功能模块。

## What Changes

- **Sidebar 布局调整**：自定义分组移至上方，内置分组移至下方；"新建模板"按钮改为自定义分组标题行右侧始终可见的小加号图标按钮
- **YAML 编辑器升级**：用 CodeMirror（含 YAML 语法高亮）替换现有的 UTextarea 纯文本区域
- **保存时 YAML 校验**：点击保存按钮时校验 YAML 格式，格式错误时以 toast 提示用户，阻止保存
- **新增 IPC channel**：`workflow:list`、`workflow:save`、`workflow:delete`，用于前端与主进程之间的 workflow 数据读写
- **持久化存储**：项目级自定义 workflow 存储在 `userData/projects/{encodedPath}/workflows/{name}.yaml`；内置 workflow 存储在 `userData/workflows/{name}.yaml`
- **内置 workflow 初始化**：主进程启动时检查 `userData/workflows/` 中内置文件是否存在，不存在则从 `electron/main/workflows/built-in/` 静默复制
- **内置 workflow 文件**：在 `electron/main/workflows/built-in/` 中新增 `quick-apply.yaml`
- **前端代码重构**：将 `workflow.vue` 中的类型、状态、组件拆分到 `shared/types`、`stores/workflow.ts`、`components/workflow/` 中

## Capabilities

### New Capabilities

- `workflow-editor`: YAML 编辑器组件，支持语法高亮、格式校验与保存
- `workflow-ipc`: 主进程 IPC handler，负责 workflow 文件的读取、保存、删除与内置初始化

### Modified Capabilities

- `pipeline-templates`: Sidebar 分组顺序调整（自定义在上、内置在下），新建按钮位置变更（移至自定义分组标题行右侧）

## Impact

- **新增依赖**：`@codemirror/lang-yaml`、`@codemirror/view`、`@codemirror/state`、`codemirror`（或 `vue-codemirror`）
- **新增文件**：`shared/types/workflow.ts`、`frontend/src/stores/workflow.ts`、`frontend/src/components/workflow/YamlEditor.vue`、`frontend/src/components/workflow/WorkflowSidebar.vue`、`frontend/src/components/workflow/WorkflowDetail.vue`、`electron/main/workflows/built-in/quick-apply.yaml`、`electron/main/workflows/index.ts`
- **修改文件**：`frontend/src/pages/workflow.vue`（精简为组合页面）、`electron/preload/index.ts`（新增 IPC 暴露）、`electron/main/index.ts`（注册 handler、触发初始化）
- **IPC 契约变更**：新增 `workflow:list`、`workflow:save`、`workflow:delete` channel
- **共享类型变更**：新增 `WorkflowTemplate`、`WorkflowStage`、`WorkflowSaveRequest`、`WorkflowListResult` 等类型到 `shared/types`
