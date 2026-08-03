## Why

FylloCode 当前将 `Folder Workspace`、`Collection Workspace`、`Folder` 等内部领域术语直接用于界面文案，要求用户理解实现模型，也让新增页面容易继续复制错误叫法。主要用户以工程仓库为工作对象，需要一套独立于内部类型、可被所有现有和未来功能复用的用户呈现术语契约。

## What Changes

- 新增跨功能的用户呈现术语规范：内部 `kind: "folder"` 对用户表达为 `Project`，内部 `kind: "collection"` 对用户表达为 `Workspace`，Workspace 的 Folder member 或 repository owner 对用户表达为 `Project`，物理路径语境使用“项目目录”。
- 同时适用于两种内部 kind 的界面 SHALL 按运行时 kind 动态使用 `Project` / `Workspace`，或使用不误称任一类型的中性文案；不得再把内部 `Workspace` 上位概念、`Folder`、`Collection`、raw enum/state 直接作为用户文案。
- 建立单一呈现映射入口，并增加面向用户文案的自动化防回退检查；新增功能必须复用相同规则，而不是维护逐文案替换清单或分散硬编码类型名称。
- 调整 launcher、编辑与生命周期、repository browser、Task/Integration、Chat/Session、导航和用户可见错误等现有界面，使它们符合统一术语规范。
- 将共同删除/恢复入口呈现为中性的“回收站”，并将 cleanup state 映射为可理解的状态文案，不直接展示 `restorable`、`purging`、`cleanup-failed`。
- 调整 Workspace 升级失败原生对话框，使标题和说明不把内部 Workspace 上位概念误当作唯一用户对象。
- 保持内部领域模型、TypeScript 类型、API/IPC、schema、storage、migration、MCP/Agent contract、ID 字段和日志诊断术语不变；本变更不进行内部重命名或数据迁移。

## Capabilities

### New Capabilities

- `workspace-presentation-terminology`: 定义 Project/Workspace 用户术语映射、动态与中性呈现规则、内部术语隔离边界，以及未来用户文案的统一约束。

### Modified Capabilities

- `workspace-window`: launcher 操作、最近打开、类型摘要、共同管理入口、导航门控和 Session scope 的用户呈现改为遵守 Project/Workspace 术语规范。
- `workspace-lifecycle`: 编辑、删除、恢复、永久清理及 cleanup 状态的用户呈现使用 Project/Workspace 或中性术语，不暴露内部 kind/state。
- `workspace-storage-cutover`: required settlement 失败原生对话框使用覆盖 Project 与 Workspace 的用户术语。

## Impact

- Renderer：`src/renderer/src/components/welcome/**`、`components/layout/**`、`components/chat/**`、Task/Integration 组件、repository browser 页面、navigation gate、Workspace store 用户消息，以及新增的呈现术语公共模块。
- Main 用户可见边界：Workspace lifecycle/session 错误投影与 `src/main/bootstrap/workspace-upgrade-failure.ts`；内部错误码和诊断详情保持不变。
- 质量约束：`guidelines/UiDesign.md`、`guidelines/QualityGates.md`、ESLint 本地规则及其聚焦测试，用规范和自动检查覆盖未来新增文案。
- OpenSpec：新增跨功能呈现术语 capability，并更新 launcher/lifecycle/cutover 中已规定的用户可见文案；其他 capability 的 Folder/Workspace 内部对象名称保持原义，由新 capability 统一约束其 UI 呈现。
- 不新增依赖，不修改 public API、IPC channel、持久化格式、migration 输入输出或 Agent/MCP 协议。
