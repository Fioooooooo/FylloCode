## 1. 建立呈现术语基础

- [x] 1.1 新增 `src/renderer/src/utils/workspace-presentation.ts`，提供 `workspaceKindLabel`、kind 可选的 subject label、Project member/主 Project/项目目录术语原子、`workspaceCleanupStateLabel` 与基于结构化错误的 `presentWorkspaceError`；新增 `test/renderer/src/utils/workspace-presentation.spec.ts` 覆盖 folder/collection、单 member collection、cleanup state 和错误投影，并保持全部内部类型与字段名不变。
- [x] 1.2 新增 `scripts/eslint-rules/renderer-user-terminology.mjs`，在 `eslint.config.mjs` 注册 renderer 用户术语规则，并新增 `test/main/scripts/renderer-user-terminology.spec.mjs` 验证 Vue template/用户字符串会阻止 `Folder Workspace`、`Collection Workspace` 和作为展示名的 Folder/Collection；内部 identifier、enum、data attribute 不报错，Agent-facing/诊断字符串只能通过带理由的显式 lint 声明排除，不建立文件 allowlist。

## 2. 迁移 launcher、生命周期和全局导航

- [x] 2.1 调整 `src/renderer/src/components/welcome/WelcomeView.vue`、`WorkspaceList.vue`、`WorkspaceEditorModal.vue`、`DeletedWorkspaceManager.vue`，按 kind 呈现 Project/Workspace，共同入口使用“最近打开”“回收站”等中性语义，member 与 path 分别使用 Project 和项目目录，并通过 helper 映射 cleanup state。
- [x] 2.2 调整 `src/renderer/src/components/layout/AppHeader.vue`、`ProjectHealthPopover.vue`、`src/renderer/src/config/navigation-gate.ts`、`src/renderer/src/pages/index.vue` 和 `src/renderer/src/stores/workspace/workspace.ts` 的用户可见文案与错误边界，使已知 kind 动态呈现、未知 kind 使用中性语义；不得改动 Workspace store 的内部状态、action 名或 IPC 参数。
- [x] 2.3 更新 `test/renderer/src/components/workspace-launcher-lifecycle.spec.ts`、`welcome-view.spec.ts`、`app-header.spec.ts`、`project-health-popover.spec.ts` 与 `test/renderer/src/stores/workspace/workspace.spec.ts`，分别验证 folder/collection、单 member Workspace、共同入口、项目目录及用户错误不泄漏内部术语。

## 3. 迁移 repository 与 automation 界面

- [x] 3.1 调整 `src/renderer/src/pages/specs.vue`、`guidelines.vue`、`proposal.vue` 与 `src/renderer/src/components/proposal/ProposalDetailSlideover.vue`、`ProposalDetailHeader.vue` 等复用组件中的 owner/filter/partial-state 用户文案，将内部 Folder owner 统一呈现为 Project，并保留 `folderId`、ref、查询参数和 ownership 校验不变。
- [x] 3.2 调整 `src/renderer/src/components/task/CreateTaskModal.vue`、`TaskDetailModal.vue`、`src/renderer/src/components/integration/ProviderStageSection.vue` 及相关用户可见错误，将 target Folder、共享 Folder 等称为 Project；保留 `targetFolderIds`、`folderId` 和 provider payload 不变。
- [x] 3.3 更新 `test/renderer/src/pages/specs.spec.ts`、`guidelines.spec.ts`、`proposal.spec.ts`、`proposal-detail.spec.ts`，以及 `test/renderer/src/components/create-task-modal.spec.ts`、`task-detail-modal.spec.ts`、`provider-stage-section.spec.ts`，验证 Project 用户术语与内部 owner/target identity 同时成立。

## 4. 迁移 Chat、Session 和原生错误边界

- [x] 4.1 调整 `src/renderer/src/components/chat/SessionScopeHeader.vue`、`empty/AgentPickerModal.vue`、`empty/InstalledAgentTile.vue` 及相邻用户提示：Session 授权 Folder 呈现为 Project，primary 呈现为主 Project，多根能力呈现为多 Project Workspace；`SessionWorkspaceSnapshot` 和 Agent capability contract 保持不变。
- [x] 4.2 在 renderer 的用户错误展示边界接入 `presentWorkspaceError`，避免直接渲染 Main 内部 message；调整 `src/main/bootstrap/workspace-upgrade-failure.ts` 使用覆盖 Project 与 Workspace 的中性原生文案，同时保持 migration ID、attempt 原因、日志位置和退出行为不变。
- [x] 4.3 更新 `test/renderer/src/components/session-scope-header.spec.ts`、`chat-empty-agent-picker.spec.ts`、`agent-picker-card.spec.ts` 与 `test/main/bootstrap/workspace-upgrade-failure.spec.ts`，覆盖 Session 差异、多 Project 能力、结构化错误投影及启动失败原生文案。

## 5. 固化规范并验证

- [x] 5.1 更新 `guidelines/UiDesign.md`，记录 Project/Workspace 的语义判定、共同范围的中性写法、Project member/项目目录边界和呈现 helper 复用要求；更新 `guidelines/QualityGates.md`，记录 renderer 用户术语 lint 门禁与显式非用户语境声明，明确不维护逐文案清单且不修改内部术语。
- [x] 5.2 对 renderer 用户可见 sink 做一次迁移完成度审计，运行新增 lint rule 的聚焦测试、受影响 renderer/Main 测试、全量 `pnpm test`、`pnpm typecheck`、`pnpm lint`、Prettier 检查和 `git diff --check`；不运行完整 `pnpm build`，不启动 `pnpm dev`。
