## 1. 依赖与共享类型

- [x] 1.1 安装 `vue-codemirror`、`@codemirror/lang-yaml`、`@codemirror/theme-one-dark`、`js-yaml` 及其类型声明 `@types/js-yaml`
- [x] 1.2 在 `shared/types/workflow.ts` 中定义 `WorkflowStageType`（`"proposal-apply" | "code-review" | "security-check" | "create-pr" | "custom"`）、`WorkflowTemplate`、`WorkflowStage`（`type` 字段使用 `WorkflowStageType`）、`WorkflowSaveRequest`、`WorkflowListRequest`、`WorkflowListResult`、`WorkflowDeleteRequest` 类型（`WorkflowListRequest` 和 `WorkflowSaveRequest`、`WorkflowDeleteRequest` 均含可选 `projectId` 字段）
- [x] 1.3 在 `shared/types/channels.ts` 中新增 `WorkflowChannels`（`workflow:list`、`workflow:save`、`workflow:delete`）
- [x] 1.4 在 `electron/main/utils/paths.ts` 的 `SubPath` 类型中新增 `"workflows"`

## 2. 主进程：内置 workflow 文件与初始化

- [x] 2.1 创建 `electron/main/workflows/built-in/` 目录，写入 `quick-apply.yaml` 内置 workflow 文件
- [x] 2.2 创建 `electron/main/workflows/index.ts`，实现 `initBuiltInWorkflows()` 函数：遍历 built-in 目录，对每个文件检查 `getDataSubPath("workflows")/{name}.yaml` 是否存在，不存在则静默复制，失败只记录 warn 日志
- [x] 2.3 在 `electron/main/index.ts` 的 `app.whenReady()` 中，在 `registerAllHandlers()` 之后调用 `initBuiltInWorkflows()`

## 3. 主进程：IPC Handler

- [x] 3.1 创建 `electron/main/ipc/workflow.ts`，实现 `registerWorkflowHandlers()`，包含 `workflow:list` handler：接收可选 `projectId`，若有则通过 `loadProject(projectId)` 拿到 `projectPath` 再 `encodeProjectPath` 构造项目级目录，读取内置 + 项目级自定义 workflow 合并返回；内置文件名通过对比 built-in 目录判断 source
- [x] 3.2 在 `workflow.ts` 中实现 `workflow:save` handler：接收 `projectId`，通过 `loadProject` + `encodeProjectPath` 构造写入路径（`getDataSubPath("projects")/{encodedPath}/workflows/{name}.yaml`），确保目录存在后写入文件
- [x] 3.3 在 `workflow.ts` 中实现 `workflow:delete` handler：内置 workflow 返回错误，自定义 workflow 按同样路径规则删除对应文件
- [x] 3.4 在 `electron/main/ipc/index.ts` 中注册 `registerWorkflowHandlers()`

## 4. Preload：暴露 workflow API

- [x] 4.1 创建 `electron/preload/api/workflow.ts`，封装 `list`、`save`、`delete` 三个方法，使用 `ipcRenderer.invoke` 调用对应 channel
- [x] 4.2 在 `electron/preload/index.ts` 中引入并挂载 `workflowApi` 到 `api.workflow`

## 5. 前端：Store 与类型

- [x] 5.1 创建 `frontend/src/stores/workflow.ts`（Pinia store），包含 `templates` 状态、`builtInTemplates`/`customTemplates` computed、`fetchTemplates`/`saveTemplate`/`deleteTemplate` actions；`fetchTemplates` 从 `useProjectStore()` 获取当前 `projectId` 并传给 IPC，内部调用 `window.api.workflow.*`

## 6. 前端：组件拆分

- [x] 6.1 创建 `frontend/src/components/workflow/YamlEditor.vue`：封装 `vue-codemirror` + YAML 高亮，接受 `modelValue`、`readonly` props，emit `update:modelValue`，根据 `useColorMode()` 切换主题
- [x] 6.2 创建 `frontend/src/components/workflow/WorkflowSidebar.vue`：侧边栏组件，自定义分组在上（标题行右侧有始终可见的加号按钮）、内置分组在下，emit `select`、`create` 事件
- [x] 6.3 创建 `frontend/src/components/workflow/WorkflowDetail.vue`：详情区组件，包含 header（名称、描述、版本、来源 badge、取消/保存按钮）、阶段预览区、`YamlEditor`，保存时调用 `js-yaml` 校验，格式错误时 toast 提示

## 7. 前端：页面整合

- [x] 7.1 重构 `frontend/src/pages/workflow.vue`：移除所有内联类型、状态、模板数据和解析逻辑，改为使用 `WorkflowSidebar`、`WorkflowDetail` 组件和 `useWorkflowStore()`，在 `onMounted` 时调用 `fetchTemplates()`；监听当前项目变化，项目切换时重新调用 `fetchTemplates()` 刷新自定义 workflow 列表

## 8. 验证

- [x] 8.1 运行 `pnpm typecheck` 确认无类型错误
- [x] 8.2 运行 `pnpm dev`，验证：首次启动后 `data/workflows/quick-apply.yaml` 存在；侧边栏自定义分组在上、内置在下；自定义标题行始终显示加号按钮；模板卡片不重复显示来源 badge；YAML 编辑器有语法高亮；保存非法 YAML 时 toast 报错；保存合法 YAML 后文件写入 `data/projects/{encodedPath}/workflows/` 正确路径且不显示成功 toast；切换项目后自定义 workflow 列表随之更新
