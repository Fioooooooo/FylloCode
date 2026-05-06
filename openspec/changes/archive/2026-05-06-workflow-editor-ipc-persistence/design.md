## Context

Workflow 页面目前是原型状态：所有类型、状态、模板数据和 UI 逻辑都集中在 `frontend/src/pages/workflow.vue` 单文件中，无持久化、无 IPC、无语法高亮编辑器。项目已有成熟的 IPC 分层模式（`shared/types/channels.ts` 定义 channel 常量、`electron/main/ipc/` 注册 handler、`electron/preload/api/` 暴露 API），本次改动沿用该模式扩展。

## Goals / Non-Goals

**Goals:**

- 将 workflow 模板数据从硬编码迁移到文件系统持久化（IPC 读写）
- 用 CodeMirror YAML 编辑器替换 UTextarea，支持语法高亮
- 保存时校验 YAML 格式，格式错误时阻止保存并提示
- Sidebar 布局调整：自定义分组在上、内置分组在下；新建按钮移至自定义分组标题行右侧
- 前端代码按职责拆分：shared types、store、components
- 主进程启动时静默初始化内置 workflow 文件

**Non-Goals:**

- Stage 字段扩展（本次不新增 stage 字段）
- Workflow 执行/运行功能
- Workflow 版本历史

## Decisions

### 1. YAML 编辑器：使用 `vue-codemirror` + `@codemirror/lang-yaml`

**选择**：`vue-codemirror`（CodeMirror 6 的 Vue 3 封装）+ `@codemirror/lang-yaml`

**理由**：

- CodeMirror 6 是业界标准的嵌入式代码编辑器，YAML 语法高亮支持完善
- `vue-codemirror` 提供 Vue 3 Composition API 友好的封装，无需手动管理 EditorView 生命周期
- 项目已有 `shiki` 用于代码高亮展示，但 shiki 不支持可编辑模式，不适合此场景
- 备选方案 `monaco-editor` 体积过大（~5MB），对于单个 YAML 编辑场景过重

**YAML 校验**：使用 `js-yaml`（`safeLoad` / `load`）在保存时做格式校验，不引入 schema 校验，只验证语法合法性。

### 2. IPC Channel 设计

沿用项目现有 `domain:action` 命名规范，新增 `WorkflowChannels`：

```
workflow:list    — 列出所有 workflow（内置 + 自定义，前端传 projectId）
workflow:save    — 保存 workflow（新建或更新，前端传 projectId）
workflow:delete  — 删除自定义 workflow（前端传 projectId）
```

**前端传 `projectId`，主进程解析路径**：与 `ipc/chat.ts` 中 `registerChatHandlers` 的模式一致——前端只传 `projectId`，主进程通过 `loadProject(projectId)` 拿到 `projectPath`，再用 `encodeProjectPath(projectPath)` 构造存储路径。

**存储路径规则**：

- 内置：`getDataSubPath("workflows")/{name}.yaml`（主进程启动时从 `electron/main/workflows/built-in/` 静默复制）
- 项目级自定义：`getDataSubPath("projects")/{encodedPath}/workflows/{name}.yaml`

`getDataSubPath` 的 `SubPath` 类型需扩展 `"workflows"`。

**内置判断策略**：list 时读取 `electron/main/workflows/built-in/` 目录中的文件名列表，凡是 `getDataSubPath("workflows")` 中与内置目录同名的文件均标记为 `source: built-in`，其余标记为 `source: custom`。

### 3. 前端代码拆分

```
shared/types/workflow.ts          — WorkflowTemplate, WorkflowStage, WorkflowSaveRequest, WorkflowListResult
frontend/src/stores/workflow.ts   — Pinia store，封装 IPC 调用与本地状态
frontend/src/components/workflow/
  YamlEditor.vue                  — CodeMirror YAML 编辑器封装
  WorkflowSidebar.vue             — 侧边栏（分组列表 + 新建按钮）
  WorkflowDetail.vue              — 详情区（header + 预览 + 编辑器）
frontend/src/pages/workflow.vue   — 精简为布局组合页
```

### 4. 内置 workflow 初始化时机

在 `registerAllHandlers()` 之后、`createWindow()` 之前，调用 `initBuiltInWorkflows()`。该函数遍历 `electron/main/workflows/built-in/` 目录，对每个文件检查 `getDataSubPath("workflows")/{name}.yaml` 是否存在，不存在则复制。静默执行，失败只记录 warn 日志，不阻塞启动。

## Risks / Trade-offs

- **CodeMirror 主题与 Nuxt UI 暗色模式**：CodeMirror 默认主题与应用暗色模式可能不一致。缓解：使用 `@codemirror/theme-one-dark` 或根据 `useColorMode()` 动态切换主题。
- **内置 workflow 被用户覆盖**：内置文件复制到 userData 后用户可修改，重启不会还原。这是预期行为（允许用户定制内置模板），但需在 UI 上明确标注"内置"来源。
- **`js-yaml` 校验仅做语法检查**：不校验 workflow schema 合法性（如缺少必填字段），用户可保存语义上不完整的 YAML。当前阶段可接受，后续可加 schema 校验。
- **bundle 体积增加**：`vue-codemirror` + `@codemirror/lang-yaml` 约增加 ~200KB gzip 后体积。对 Electron 应用可接受。
