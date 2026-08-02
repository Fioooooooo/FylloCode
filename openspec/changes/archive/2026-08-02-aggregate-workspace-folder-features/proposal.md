## Why

Workspace/Folder 基础设施已经建立，但 Specs、Guidelines 与 Overview 仍从单一 `resolveWorkspaceCwd` 读取 repository 数据，无法表达 multi-root 的完整结果、部分失败或跨 Folder 同名对象；Task、Workflow 与 Integration 虽已使用 Workspace storage，也尚未完成 repository target 的软引用与 Folder binding 契约。需要在清理 legacy Project storage 前统一这些剩余能力的 scope，避免 UI 和自动化继续把 Workspace 当作单一 repository path。

## What Changes

- 引入统一的 per-Folder repository aggregate envelope：每个成员独立返回 `ready | missing | error`、Folder metadata、items 与 item warnings；合法空目录与读取失败保持可区分，部分失败保留其他 Folder 数据并明确 completeness。
- 将 Specs 与 Guidelines browser 改为扫描当前 Workspace 的全部 Folder，以 `SpecRef { folderId, specId }` 和 `GuidelineRef { folderId, path }` 作为列表、选择、详情与缓存 identity；页面提供不会改变对象 owner 的 Folder filter、owner badge 和 Folder 级 empty/missing/error 状态。
- 为 Proposal browser 补齐与其他 repository browser 一致的 Folder filter 和 partial aggregate 呈现，同时继续使用完整 `ProposalRef`，不改变 create/apply/archive owner 规则。
- 重构 Overview：Workspace work（subject、task-linked ratio、recent lineage）仅从当前 `workspaceDataDir` 读取一次；repository governance（proposal/spec/guideline/archive/Git evolution）按 Folder 独立聚合，只统计 ready 结果，并显式标注 partial totals 与未计入 Folder。
- 固化 Task、Workflow、Integration config 的 Workspace-owned storage：Task 增加 `targetFolderIds` 软引用与 resolved/stale 投影，legacy task 不猜 owner；成员移除不被 task 阻塞且不会改写原始 targets。
- 为 repository-bound integration resource 增加显式 `folderId` binding，并在读写时验证当前 Workspace membership；缺失成员保留配置并投影 stale，不静默绑定 primary。Workflow 继续保持 Workspace-owned，不因 Folder filter 或成员变化迁移到 repository storage。
- 清点 local file links、Fyllo Action、plan、spawned session 等剩余调用点，移除本提案范围内未经解释的单 `projectPath` 假设，并把 §23 对应 inventory 改为 proposal/spec 追踪关系。

## Capabilities

### New Capabilities

- `repository-browser-aggregation`: 定义 Workspace 中 repository-owned reader 的 per-Folder envelope、partial completeness、Folder filter 与 owner-qualified identity 共同行为。
- `specs-browser`: 定义 Specs browser 的 multi-Folder 扫描、`SpecRef` identity、详情选择以及 Folder 级空态/错误态。
- `workspace-automation-storage`: 定义 Task、Workflow 与 Integration config 的 Workspace-owned storage，以及 task target 软引用和 integration Folder binding/stale 投影。

### Modified Capabilities

- `guidelines-browser`: 从单 repository 列表/详情改为 multi-Folder aggregate，并使用完整 `GuidelineRef` 隔离同路径 guideline。
- `proposal-browser`: 增加 Folder filter、per-Folder partial state 与 owner scope 呈现，同时保持 `ProposalRef` 选择和操作 identity。
- `project-overview`: 将 Workspace work 与 per-Folder repository governance 分离读取，并公开 partial totals、未计入 Folder 与 owner-qualified active proposal 数据。

## Impact

- Shared/IPC/Preload contracts：`src/shared/types/{specs,guidelines,overview,task,integration}.ts`、对应 `src/shared/ipc/**` schemas/channels 与 `src/preload/**`。
- Main：`src/main/services/insight/{specs,guidelines,overview}/**`、`src/main/services/proposal/browser/**`、相关 IPC handlers，以及 `src/main/services/automation/{task,workflow,workspace-integration}/**` 和 Workspace storage adapters。
- Renderer：Insight/Proposal/Automation stores，`specs.vue`、`guidelines.vue`、`proposal.vue`、`overview.vue`、`task.vue`、`workflow.vue`、`integration.vue` 及其聚合/筛选组件。
- 数据兼容：现有 Workspace task 和 integration config 必须可读；legacy task 缺少 targets 时保持未绑定，integration 旧记录不得猜 primary。若持久化 schema 需要版本提升，采用读取时兼容与原子写回，不修改已归档的 cutover migration。
- 验证：Main/Preload/Renderer 聚焦 Vitest、`pnpm typecheck`、`pnpm lint`、Prettier 与 `git diff --check`；不运行完整 `pnpm build`，不启动 `pnpm dev`。
