## 1. Contract Inventory And Guard Tests

- [x] 1.1 运行并记录旧 channel/旧 preload 形状引用清单：`rg -n "window\\.api\\.(chat|proposal|task|workflow|settings|project|window|overview|specs|guidelines|integration|acpAgents)|chat:|proposal:|lineage:|task:|workflow:|settings:|project:|window:|overview:|specs:|guidelines:|integration:|integrations:|acp:" openspec src test references guidelines`；将 active contract/code/test/doc 引用列入后续修改，不修改 historical/archive 文本。
- [x] 1.2 运行并记录持久化路径/schema 清单：`rg -n "getDataSubPath|lineage|subjects|connections\\.json|credentials|config\\.json|window-state|apply-runs|sessions|workflows|tasks|mcp-events|acp" src/main test/main openspec references guidelines`；确认 `src/main/infra/storage/**` 的 path/key/schema 不因本重构改变。
- [x] 1.3 在 `test/preload/index.spec.ts` 或等效新测试中断言 `src/preload/index.ts` 暴露 `platform`、`workspace`、`session`、`proposal`、`insight`、`automation` root namespace，并断言不暴露旧 `chat`、`task`、`workflow`、`acpAgents` flat root。
- [x] 1.4 在 `test/shared/ipc/domain-channels.spec.ts` 或等效新测试中 snapshot 关键 channel 常量：`session:chat:*`、`proposal:browser:*`、`proposal:apply:*`、`proposal:archive:*`、`platform:settings:*`、`platform:release:*`、`insight:overview:*`。
- [x] 1.5 在 `test/main/ipc/index.spec.ts` 或现有 IPC 测试中断言 main IPC registration 对每个新 channel 只注册一次，并且 final-state 测试不引用旧 flat channel。
- [x] 1.6 为 storage compatibility 增加 focused regression：扩展 `test/main/infra/storage/provider-stores.spec.ts`、`test/main/infra/storage/window-state-store.spec.ts`、`test/main/infra/storage/lineage-store.spec.ts`、`test/main/infra/storage/session-store.spec.ts`、`test/main/infra/storage/task-store.spec.ts`、`test/main/infra/storage/apply-run-store.spec.ts`，断言现有 path/key/schema 常量与迁移前兼容。
- [x] 1.7 建立文件移动规则：所有纯移动/重命名优先使用 `git mv` 或 Git 可识别 rename 的等效方式；一批移动完成后运行 `git status --short` 和 `git diff --find-renames --summary`，确认关键生产文件和镜像测试尽可能显示为 rename，而不是 delete/add。

## 2. Shared IPC Contracts

- [x] 2.1 使用 `git mv` 或 Git 可识别 rename 的等效方式创建 `src/shared/ipc/platform/{app,settings,release,providers,acp-agents}.channels.ts` 和对应 `.schemas.ts`，从 `src/shared/types/channels.ts` 与 `src/shared/schemas/ipc/{app,settings,integration,acp-agents}.ts` 迁移常量/schema；release check channel 使用 `platform:release:checkLatestRelease`。
- [x] 2.2 使用 `git mv` 或等效 rename 创建 `src/shared/ipc/workspace/{project,window}.channels.ts` 和对应 `.schemas.ts`，迁移 `project`、`window` channel/schema。
- [x] 2.3 使用 `git mv` 或等效 rename 创建 `src/shared/ipc/session/chat.channels.ts` 和 `chat.schemas.ts`，迁移 chat/session/stream/probe channel/schema 到 `session:chat:*`。
- [x] 2.4 使用 `git mv` 或等效 rename 创建 `src/shared/ipc/proposal/{browser,apply,archive}.channels.ts` 和对应 `.schemas.ts`；将 proposal list/detail/status/watch/read model 归入 `proposal:browser:*`，apply stream/run 归入 `proposal:apply:*`，archive stream/run 归入 `proposal:archive:*`。
- [x] 2.5 使用 `git mv` 或等效 rename 创建 `src/shared/ipc/insight/{overview,specs,guidelines,lineage}.channels.ts` 和对应 `.schemas.ts`，迁移 overview/specs/guidelines/lineage channel/schema 到 `insight:*`。
- [x] 2.6 使用 `git mv` 或等效 rename 创建 `src/shared/ipc/automation/{workflow,task,project-integration}.channels.ts` 和对应 `.schemas.ts`，将 workflow/task/project integration channel/schema 迁移到 `automation:*`。
- [x] 2.7 更新 `src/shared/types/channels.ts`、`src/shared/types/index.ts` 和 schema barrel exports：保留仅迁移期需要的 compatibility re-export，但 final-state code/tests 不从旧 flat authoring surface 新增 active channel。
- [x] 2.8 更新 `test/shared/**` 和 `test/main/ipc/**` 中的 channel/schema import，使所有 active 测试使用新 domain-local contract。

## 3. Main IPC Handlers

- [x] 3.1 使用 `git mv` 将 `src/main/ipc/app.ts`、`settings.ts`、`acp-agents.ts` 中的 handler 移到 `src/main/ipc/platform/{app,settings,release,acp-agents,providers}.ts`；`checkLatestRelease` 注册到 `platform/release.ts`。
- [x] 3.2 使用 `git mv` 将 `src/main/ipc/project.ts`、`window.ts` 移到 `src/main/ipc/workspace/{project,window}.ts`。
- [x] 3.3 使用 `git mv` 将 `src/main/ipc/chat.ts` 移到 `src/main/ipc/session/chat.ts`，使用 `SessionChatChannels` 和 `session:chat:*` stream/cancel/event channel。
- [x] 3.4 使用 `git mv` 将 `src/main/ipc/proposal.ts` 拆到 `src/main/ipc/proposal/browser.ts`；将 `src/main/ipc/proposal-apply.ts` 拆到 `src/main/ipc/proposal/apply.ts` 与 `src/main/ipc/proposal/archive.ts` 时保留原文件主要历史到最接近的目标文件，抽取共享 runtime helper，避免 delete/add 式重写。
- [x] 3.5 使用 `git mv` 将 `src/main/ipc/overview.ts`、`specs.ts`、`guidelines.ts`、`lineage.ts` 移到 `src/main/ipc/insight/{overview,specs,guidelines,lineage}.ts`。
- [x] 3.6 使用 `git mv` 将 `src/main/ipc/workflow.ts`、`task.ts`、`integration.ts` 移到 `src/main/ipc/automation/{workflow,task,project-integration}.ts`；全局 provider connection/registry 相关 handler 迁到 `platform/providers.ts`。
- [x] 3.7 更新 `src/main/ipc/index.ts`，从 domain paths 注册所有 handler，并保持 deterministic registration；移除旧 flat IPC handler imports。
- [x] 3.8 使用 `git mv` 移动 `test/main/ipc/*.spec.ts` 到镜像路径 `test/main/ipc/<domain>/<area>.spec.ts`，或更新测试描述/import 以匹配新 handler 路径和 channel。
- [x] 3.9 在收紧 lint 前清理 IPC handler 对 `@main/infra/*` 的 value import；无法立即清理的 stream-runtime 例外必须在 `eslint.config.mjs` 中显式列名并有任务注释。

## 4. Main Services And Pure Domain Helpers

- [x] 4.1 使用 `git mv` 将 `src/main/services/acp-agent/**`、`settings/**`、`release/**` 和 provider connection/registry/resource service 移到 `src/main/services/platform/{acp-agent,settings,release,providers}/**`；同步移动 `test/main/services/**` 镜像测试。
- [x] 4.2 使用 `git mv` 将 `src/main/services/project/**` 移到 `src/main/services/workspace/project/**`；同步移动测试。
- [x] 4.3 使用 `git mv` 将 `src/main/services/chat/**` 移到 `src/main/services/session/chat/**`；同步移动测试。
- [x] 4.4 使用 `git mv` 将 `src/main/services/proposal/**` 移到 `src/main/services/proposal/{browser,apply,archive,runtime}/**`；`apply-run-service.ts` 和 stage/archive stream 共享逻辑放入明确的 `runtime` 或 internal module，避免复制。
- [x] 4.5 使用 `git mv` 将 `src/main/services/overview/**`、`specs/**`、`guidelines/**`、`lineage/**` 移到 `src/main/services/insight/{overview,specs,guidelines,lineage}/**`；同步移动测试。
- [x] 4.6 使用 `git mv` 将 `src/main/services/workflow/**`、`task/**` 和 project integration service 移到 `src/main/services/automation/{workflow,task,project-integration}/**`；同步移动测试。
- [x] 4.7 为需要跨 domain 复用的 service domain 创建 `src/main/services/{platform,workspace,session,proposal,insight,automation}/_public/index.ts`；只显式 export 稳定方法，禁止 `export *`。
- [x] 4.8 更新跨 domain service imports：例如 proposal apply/archive 需要 session stream runtime 时 import `@main/services/session/_public`，insight lineage 需要 task command 时 import `@main/services/automation/_public`；禁止直接 import `@main/services/<other-domain>/<area>/**`。
- [x] 4.9 使用 `git mv` 迁移 `src/main/domain/acp/**` 到 `src/main/domain/platform/acp-agent/**`，`src/main/domain/workflow/**` 到 `src/main/domain/automation/workflow/**`，`src/main/domain/lineage/**` 到 `src/main/domain/insight/lineage/**`。
- [x] 4.10 使用 `git mv` 迁移 `src/main/domain/chat/**` 到 `src/main/domain/session/chat/**` 或明确的 shared runtime owner；解决 `src/main/services/session/chat/message-assembler.ts` 与 `src/main/domain/session/chat/message-assembler.ts` 的重复关系，最终只有一个真实实现。
- [x] 4.11 使用 `git mv` 移动 `test/main/domain/**` 到镜像目标路径，并更新 imports；确保 `src/main/domain/**` 仍不依赖 Electron、services、infra、IPC、bootstrap、fs/path/process。

## 5. Preload API And Renderer API Wrappers

- [x] 5.1 使用 `git mv` 将 `src/preload/api/{app,settings,acp-agents}.ts` 拆/移到 `src/preload/api/platform/{app,settings,release,acp-agents,providers}.ts`；`checkLatestRelease` 只在 `platform/release.ts` 暴露。
- [x] 5.2 使用 `git mv` 将 `src/preload/api/{project,window}.ts` 移到 `src/preload/api/workspace/{project,window}.ts`。
- [x] 5.3 使用 `git mv` 将 `src/preload/api/chat.ts` 移到 `src/preload/api/session/chat.ts`。
- [x] 5.4 使用 `git mv` 将 `src/preload/api/proposal.ts` 拆到 `src/preload/api/proposal/{browser,apply,archive}.ts`；保留原文件主要历史到最接近的目标文件，抽取新文件时避免复制实现。
- [x] 5.5 使用 `git mv` 将 `src/preload/api/{overview,specs,guidelines,lineage}.ts` 移到 `src/preload/api/insight/{overview,specs,guidelines,lineage}.ts`。
- [x] 5.6 使用 `git mv` 将 `src/preload/api/{workflow,task,integration}.ts` 移到 `src/preload/api/automation/{workflow,task,project-integration}.ts`，并把 global provider preload API 移到 `platform/providers.ts`。
- [x] 5.7 更新 `src/preload/index.ts` 和 `src/preload/index.d.ts`，最终只暴露 `platform`、`workspace`、`session`、`proposal`、`insight`、`automation` root namespaces。
- [x] 5.8 使用 `git mv` 移动 `test/preload/api/**` 到 `test/preload/api/<domain>/<area>.spec.ts`，并新增/更新 `test/preload/index.spec.ts` 覆盖完整 `window.api` shape。
- [x] 5.9 使用 `git mv` 将 `src/renderer/src/api/**` 移到 `src/renderer/src/api/<domain>/<area>.ts`，并更新每个 wrapper 调用 `window.api.<domain>.<area>`；最终无 wrapper 调用 `window.api.<area>`。

## 6. Renderer Stores, Pages, Components

- [x] 6.1 使用 `git mv` 将 `src/renderer/src/stores/acp-agents.ts`、`settings.ts`、`integration.providers.ts` 移到 `src/renderer/src/stores/platform/{acp-agents,settings,providers}.ts`；release check 若只服务 settings 页面，则作为 `platform/settings.ts` action，不创建无状态 release store。
- [x] 6.2 使用 `git mv` 将 `src/renderer/src/stores/project.ts` 移到 `src/renderer/src/stores/workspace/project.ts`。
- [x] 6.3 使用 `git mv` 将 `src/renderer/src/stores/chat.ts`、`session.ts` 移到 `src/renderer/src/stores/session/{chat,session}.ts`；如需要 event rail workflow，可新增 `src/renderer/src/stores/session/event-rail.ts`。
- [x] 6.4 使用 `git mv` 将 `src/renderer/src/stores/proposal.ts`、`proposal-run.ts` 移到 `src/renderer/src/stores/proposal/{browser,run}.ts`；不要为了匹配 `proposal.apply`/`proposal.archive` API 强制拆分共享 run UI state。
- [x] 6.5 使用 `git mv` 将 `src/renderer/src/stores/overview.ts`、`specs.ts`、`guidelines.ts` 和 lineage 相关 page/component 逻辑迁到 `src/renderer/src/stores/insight/{overview,specs,guidelines,lineage}.ts`。
- [x] 6.6 使用 `git mv` 将 `src/renderer/src/stores/workflow.ts`、`task.ts`、`integration.ts`、`integration.config.ts` 移到 `src/renderer/src/stores/automation/{workflow,task,project-integration}.ts` 或明确的 automation store 文件。
- [x] 6.7 更新 `src/renderer/src/stores/index.ts` 只 re-export domain-owned store entry points，不隐藏所有权。
- [x] 6.8 更新 `src/renderer/src/pages/**`、`src/renderer/src/components/**`、`src/renderer/src/composables/**` imports：页面只直接 import 所属 domain store；跨 domain 逻辑移动到 owner store action 或目标 domain public store/facade。
- [x] 6.9 清理 renderer store 直接 import 其他 domain API wrapper 的情况，例如 `session` 不直接 import `proposalApi`/`lineageApi`，`task.vue` 不直接 import `lineageApi`。
- [x] 6.10 使用 `git mv` 移动 `test/renderer/src/stores/**`、相关 page/component/composable 测试到镜像路径，并更新 mocks 到新的 renderer API wrapper 路径。

## 7. Static Guards And Guidelines

- [x] 7.1 更新 `eslint.config.mjs`：renderer non-wrapper code 禁止直接调用 `window.api`；`src/renderer/src/api/**` 是唯一允许直接访问 `window.api` 的 renderer 路径。
- [x] 7.2 更新 `eslint.config.mjs`：renderer store 禁止 import 其他 domain 的 renderer API wrapper；page/component 禁止直接 import 无关 product domain store。
- [x] 7.3 更新 `eslint.config.mjs`：main service 跨 domain import 只能指向 `@main/services/<target-domain>/_public`；禁止 import `@main/services/<target-domain>/<area>/**`。
- [x] 7.4 更新 `eslint.config.mjs`：禁止 `src/main/services/<domain>/<area>/_public/**`；禁止 `src/main/services/<domain>/_public/**` 使用 `export *`；禁止 `_public` import 其他 product domain service。
- [x] 7.5 更新 `eslint.config.mjs`：收紧 main IPC handler 对 `@main/infra/*` 的 value import，保留的例外必须具体列名并有说明。
- [x] 7.6 更新 `guidelines/Architecture.md`：记录六领域 taxonomy、domain-first request path 和 OpenSpec 行为契约边界。
- [x] 7.7 更新 `guidelines/MainProcess.md`：记录 main IPC/service/domain/infra 的 domain 目录规则、`service/<domain>/_public` 跨领域入口规则、IPC channel 命名规则。
- [x] 7.8 更新 `guidelines/RendererProcess.md`：记录 `window.api.<domain>.<area>`、renderer wrapper domain 路径、store 不与 service 同形、page/store 跨领域规则。
- [x] 7.9 更新 `guidelines/Testing.md`：记录迁移后测试目录镜像规则，尤其是 `test/main/ipc/<domain>/**`、`test/main/services/<domain>/**`、`test/preload/api/<domain>/**`、`test/renderer/src/stores/<domain>/**`。
- [x] 7.10 更新 `guidelines/QualityGates.md`：记录新增 lint 边界规则和 `pnpm lint` 对跨领域 import 的阻塞作用。

## 8. Spec/Doc Cleanup And Verification

- [x] 8.1 全库再次运行旧 channel/旧 preload 形状 grep；确认 active code/test/doc 中不再出现旧 contract 文本，历史/归档文本保留时加注释或记录原因。正式 `openspec/specs/**/spec.md` 由 archive 阶段根据本 change 的 delta specs 自动同步。
- [x] 8.2 运行 `pnpm exec vitest run --project main test/preload test/shared test/main/ipc test/main/services test/main/domain test/main/infra/storage`，修复与 contract/storage/path/import 相关失败。
- [x] 8.3 运行 `pnpm exec vitest run --project renderer test/renderer/src/stores test/renderer/src/pages test/renderer/src/components test/renderer/src/composables`，修复 renderer import/store/API wrapper 相关失败。
- [x] 8.4 运行 `pnpm lint`，确保新增跨领域 import 和 `window.api` 访问规则生效。
- [x] 8.5 运行 `pnpm typecheck`，修复 main/preload/renderer type shape 变化导致的类型错误。
- [x] 8.6 运行 `pnpm test` 和 `pnpm build`，确保完整测试和构建通过。
- [x] 8.7 手动 smoke 或开发启动验证 launcher、project window、`/chat`、`/proposal`、`/task`、`/integration`、`/overview`、`/specs`、`/guidelines`、`/settings`、chat stream cancel、proposal apply/archive stream、ACP agent events、proposal status watcher events。
- [x] 8.8 运行 `git diff --find-renames --summary`，检查大批移动后的关键文件尽可能被 Git 识别为 rename；对显示为 delete/add 的重要文件，优先调整为 `git mv` 后再编辑，或在任务记录中说明无法保留 blame 的原因。
