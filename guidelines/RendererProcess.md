---
name: RendererProcess
description: Vue 渲染进程的分层、路由、状态管理、UI 约束与启动流程
keywords: [renderer, vue, pinia, routing, ui]
---

# RendererProcess

## Purpose

定义 `src/renderer/src/` 的目录职责、UI 分层、状态管理、页面路由、启动预热与渲染层访问主进程能力的唯一方式。任何涉及页面、组件、store、api、bootstrap 或前端专属类型的工作，都必须先阅读本文档。

## Applicability

- 适用于 `src/renderer/src/**`、`src/renderer/index.html`、前端专属测试与生成文件。
- 适用于 `pages/`、`layouts/`、`components/`、`stores/`、`api/`、`bootstrap/`、`composables/`、`utils/`、`types/`。
- 不覆盖格式化、命名、Prettier/ESLint 细则；见 `guidelines/CodeStyle.md`。
- 不覆盖 IPC channel 契约与 preload 公开接口语义；见 `guidelines/IPC.md`。

## Sources of Truth

- `src/renderer/src/**`
- `electron.vite.config.ts`
- `src/renderer/src/main.ts`
- `src/renderer/src/App.vue`
- `src/renderer/src/bootstrap/**`
- `src/renderer/src/stores/**`
- `src/renderer/src/api/**`
- `src/renderer/src/pages/**`
- `src/renderer/src/components/**`
- `src/renderer/src/components/shared/ConfirmDialog.vue`
- `src/renderer/src/typed-router.d.ts`
- `src/renderer/src/composables/useConfirmDialog.ts`
- `openspec/specs/app-shell-routing/spec.md`
- `openspec/specs/project-page-routing/spec.md`
- `openspec/specs/settings-page/spec.md`
- `openspec/specs/workspace-layout/spec.md`
- `openspec/specs/app-bootstrap/spec.md`

## Rules

- MUST: 将渲染进程视为 Vue 单页应用，所有页面与组件代码落在 `src/renderer/src/` 下，不得直接访问 Node 或 Electron 原生 API。
- MUST: 通过 `src/renderer/src/api/<domain>.ts` 作为 `window.api.<domain>` 的唯一薄封装入口；页面、组件、store、composables 均不得直接调用 `window.api.*`。
- MUST: 让 `stores/` 成为全局状态、异步编排、loading/error 状态建模和首次加载去重的唯一入口；页面与组件应消费 store，而不是自己分散发起相同请求。
- MUST: 使用文件系统路由，页面放在 `src/renderer/src/pages/`，由 `vue-router/auto` 生成 `src/renderer/src/typed-router.d.ts`；该文件禁止手动修改。
- MUST: 在 `src/renderer/src/main.ts` 中先完成 `mount("#app")`，再触发 bootstrap 任务；启动预热不得阻塞首屏渲染。
- MUST: 保持 `src/renderer/src/App.vue` 使用 `<UApp>` 包裹渲染树；`useOverlay()` 与基于 overlay 的全局确认弹窗依赖 `UApp` 内部 provider，缺失时 overlay 不会渲染。
- MUST: 将启动时的全局预热任务注册到 `src/renderer/src/bootstrap/`，避免由多个页面重复承担同一份全局初始化职责。
- MUST: 将跨进程共享类型放在 `@shared/types/*`，只在纯前端使用的类型才放在 `src/renderer/src/types/`。
- MUST: 渲染进程打开外部链接时使用标准锚点语义（如 `<a target="_blank" rel="noreferrer">` 或 `UButton as="a"`）；链接会由主进程 `src/main/bootstrap/window.ts` 中的 `setWindowOpenHandler` 与 `will-navigate` 守卫统一处理：仅 `http`/`https`（经 `isSafeExternalUrl` 判定）转交 `shell.openExternal`，`file:` 和自定义 scheme 一律丢弃，且任何离开 app shell 的顶层导航都被阻止。渲染进程不得直接引用 `shell`，也无需为此新增 IPC。
- MUST: 将 UI 层职责保持清晰：`pages/` 负责路由单元和页面编排，`components/` 负责展示与交互，`layouts/` 负责骨架，`stores/` 负责状态和异步动作，`api/` 负责薄转发。
- MUST: 将 `UModal` 视为结构组件而非业务状态容器。标题和描述优先使用 `title` / `description` props；正文使用 `#body`；按钮区使用 `#footer`；不要在局部弹窗里重复实现全局已在 `electron.vite.config.ts` 中声明的 footer 对齐和间距规则。
- MUST: 让 `#body` 复用 `UModal` 默认内边距，不要再用一层 `p-4`/`p-5`/`p-6` 包裹整个 body；只在内部内容块上定义必要的 `gap-*`、`space-y-*` 或局部 padding。
- MUST: 简单二选一确认弹窗统一通过 `src/renderer/src/composables/useConfirmDialog.ts` 发起。这里的“简单确认”指只有标题、描述、取消/确认按钮，没有额外表单、长说明、代码块、滚动列表或多状态切换。
- MUST: 复杂弹窗继续直接使用 `UModal`，包括需要表单输入、富文本/代码块说明、滚动列表、多状态切换，或确认前必须展示额外上下文的场景；不要为了复用 `useConfirmDialog` 而硬塞复杂内容。
- MUST: `src/renderer/src/components/shared/ConfirmDialog.vue` 自行通过 `UModal #content` 渲染 icon、标题、描述和操作区，不依赖 `UModal` 默认 header/footer；这是为了避免默认分隔线和局部重复布局，并保持全局确认弹窗视觉统一。
- MUST: `useConfirmDialog()` 打开的确认弹窗必须通过显式按钮关闭并 resolve `Promise<boolean>`；调用方只把它当成确认结果使用，不要依赖 overlay 实例内部状态。
- SHOULD: 将模板中的复杂逻辑下沉到 `stores/`、`composables/` 或 `utils/`，避免在 Vue template 内内联复杂表达式。
- SHOULD: 使用现有业务域目录，例如 `components/chat/`、`components/proposal/`、`components/settings/`、`components/integration/`，保持 UI 代码按功能聚合。
- SHOULD: 当确认弹窗的危险程度需要视觉区分时，让 `ConfirmDialog` 的按钮颜色驱动有限的 icon tone 变化：危险操作可使用 `error`，其余确认保持较克制的 warning 语义，避免把普通确认做得过于鲜艳。
- MAY: 在 `src/renderer/src/composables/` 增加跨组件复用逻辑，但如果它会持有全局状态或跨页面生命周期，应优先考虑 store。

## Examples

- Good: `src/renderer/src/stores/integration.providers.ts` 作为 settings 与 `/integration` 页共享的 provider 状态入口。
- Good: `src/renderer/src/api/project.ts` 仅返回 `window.api.project.*` 的类型化 Promise，而不承担缓存或 toast 逻辑。
- Good: `src/renderer/src/stores/overview.ts` 通过 `src/renderer/src/api/overview.ts` 读取单一 `ProjectOverview` DTO，并在 store 内集中维护 loading/error/null data 状态，页面只负责三态编排。
- Good: `src/renderer/src/bootstrap/tasks/projects.ts` 调用 store 的 `ensureInitialized()` 预热 persisted project 列表。
- Good: 组件里用 `<a target="_blank" rel="noreferrer">` 或 `UButton as="a"` 打开外站，让 `setWindowOpenHandler` 统一走系统浏览器。
- Good: `src/renderer/src/components/task/TaskCard.vue` 的删除确认通过 `useConfirmDialog()` 发起，只在用户确认后继续 emit 删除事件。
- Good: `src/renderer/src/components/settings/AgentCard.vue` 的卸载确认仍直接使用 `UModal`，因为正文包含卸载命令、附注和更复杂的解释信息。
- Good: `src/renderer/src/components/shared/ConfirmDialog.vue` 使用 `UModal #content` 自定义整块布局，而不是叠加默认 header/footer 分隔线。
- Bad: 在 Vue 组件内直接 `window.api.integration.projectSet(...)`。
- Bad: 在 renderer 中直接导入 Electron `shell` 或为了外链再封一层专用 IPC。
- Bad: 在页面里直接写 `fetch(...)`、`ipcRenderer.invoke(...)` 或用多个组件各自加载同一份全局配置数据。
- Bad: 为了一个“确认/取消”弹窗，在每个业务组件里重复写 `const showConfirm = ref(false)`、`<UModal>` 和同构 footer 按钮。
- Bad: 在 `UModal #footer` 外再包一层仅用于 `justify-end gap-2` 的容器，覆盖已经由全局 modal 主题接管的布局。
- Bad: 在 `UModal #body` 再套整层 `p-6`，导致默认 body padding 与局部内容 padding 叠加失控。

## Chat Prompt Capabilities

- `useAcpAgentsStore.promptCapabilitiesByAgent` 维护 renderer 内存态的 `Map<agentId, AcpPromptCapabilities>`；启动期通过 `loadCapabilitiesCache()` 预热，切换 agent 时通过 `refreshCapabilities(agentId)` 触发主进程 `acp:ensureAgent`。
- 未命中 capability 时，`getPromptCapabilities(agentId)` 必须返回 `{ image: false, audio: false, embeddedContext: false }`，UI 入口按不支持处理。
- `src/renderer/src/utils/chat-message-parts.ts` 提供 `isUserImagePart` / `isUserFilePart`，只用于 user message 的 AI SDK `FileUIPart` 渲染分派；assistant file part 当前不渲染。

## Chat Markdown Rendering

- `src/renderer/src/components/shared/MarkStream.vue` 是 assistant Markdown 渲染的统一入口；新增 markstream-vue 自定义 HTML 标签时，必须通过当前实例的 `custom-id` 调用 `setCustomComponents(customId, mapping)` 注册 scoped component，并在组件卸载或 `custom-id` 变化时调用 `removeCustomComponents(previousId)` 清理 mapping，避免不同消息实例串用自定义组件。
- Fyllo action 渲染必须保持展示与执行边界：`src/renderer/src/components/shared/markstream/FylloActionShell.vue` 只负责通用状态展示、状态流转和用户确认/取消交互；不同 action type 的正文展示必须通过 `src/renderer/src/config/fyllo-actions.ts` 绑定专用组件，例如 `src/renderer/src/components/chat/action/TaskCreateAction.vue`。这些展示组件不得 import `window.api`、`src/renderer/src/api/*`、Pinia store 或 task 业务模块；业务 handler 只能由容器节点通过 `src/renderer/src/composables/useFylloActionDispatcher.ts` 挂接。

## Draft Session Probe

- `useSessionStore.draftProbeByAgent` 维护草稿态 probe 的 renderer 内存镜像；`activeDraftProbe` 只跟随当前 `draftAgentId`，切 agent 时必须先清旧 entry，再 debounce 发起新 `probeEnsure`。
- 草稿态 probe 通过 `src/renderer/src/api/chat.ts` 调用 preload 暴露的 `chat:probe:*` IPC；组件不得直接访问 `window.api.chat` 或 IPC channel。
- `ConfigOptionsBar` 在已建立 session 时读取 `activeSession.configOptions`，草稿态只在 `activeDraftProbe.status === "ready"` 时读取 probe config options；starting/failed/null 均不渲染。
- `sendMessage` 在草稿态创建首个 fyllo session 时，必须使用创建前捕获的 probe 快照：当快照为 `ready` 且 `acpSessionId` 非空时，把 `configOptions` 与 `acpSessionId` 一并透传给 `useSessionStore.createSession`，`createSession` resolve 后再调用 `applyProbeUpdate(agentId, null)` 清空 draft probe；后续 `chatApi.streamMessage` 仍传同一个 `acpSessionId`。`createSession` 抛错路径下不清空 draft probe，让下次发送复用同一快照。

## Chat Session Proposals

- `useSessionStore.sessionProposals` 维护 `Record<sessionId, ProposalMeta[]>`，展示在 `ChatSessionEventRail` 的 `ChatProposalPanel` 中。它通过 `proposalApi.onStatusChanged` 接收主进程推送的 `proposal:statusChanged` 事件增量更新，并在切换 `activeSession` 时从 `useProposalStore.proposals` 与 lineage 数据回填历史 proposals。
- `ChatProposalPanel` 只渲染状态 badge 与操作入口（draft 时“开始实现”、applying 且 run 完成时“归档”、其他状态“查看详情”），不展示 apply/archive 的流式执行日志；实现与归档复用 `useProposalRunStore.startRun` / `startArchive`。

## Chat Session Event Rail

- `ChatSessionEventRail` 可以展示执行计划、proposal 入口和当前 Chat 主会话内未处理的 Fyllo action 提醒。pending Fyllo action 必须从 `activeSession.messages` 与 `activeSession.actionStates` 响应式派生；缺失 action state 表示待处理，`succeeded` / `failed` / `cancelled` 任一状态存在后不再作为 pending rail item 展示。
- Fyllo action rail item 只负责提醒与定位：组件只能 emit `locate-action`，由 `ChatContainer` 在消息滚动容器内查找 `data-fyllo-action-id` anchor 并滚动到原 action card。事件栏不得 import action dispatcher、task store、lineage API、`src/renderer/src/api/*` 或 `window.api`，也不得确认、取消、重试或持久化 action state。

## Chat Session Streams

- `useChatStore` 必须按已建立的 `sessionId` 维护 chat stream run、status、cancel 和瞬时 error；组件消费的 `chatStatus`、`streamError`、`cancelFn` 只能从当前 `useSessionStore.activeSessionId` 对应 session 派生，草稿态或无运行态时回落为 `ready` / `null`。
- 选择 session 或进入草稿态只能清当前视图瞬时错误，不得取消、失效或清空其他 session 的后台 stream。只有显式 stop 可以取消当前选中 session 的 run，或取消仍处于首条消息 setup 阶段的 pending draft run。
- 后台 session 的有效 stream 回调必须继续更新所属 session 的内存消息、标题、token usage、可用命令、配置选项、计划状态和 session 状态；切回已加载 session 时应显示这份内存最新状态，而不是依赖重新读磁盘修正丢失的 chunk。

## Verification

- `pnpm lint`
- `pnpm typecheck:web`
- `pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`
- 如果改动涉及路由文件，运行 `pnpm dev` 或对应生成链路，确认 `src/renderer/src/typed-router.d.ts` 正常更新。
- 如果改动涉及 bootstrap/store 初始化，检查是否引入了重复加载、loading 无法回收或错误状态遗漏。
- 如果改动涉及 `UModal` 结构、`ConfirmDialog.vue`、`useConfirmDialog.ts` 或 `electron.vite.config.ts` 中的 modal 主题，至少验证一个直接使用 `UModal` 的组件和一个通过 `useConfirmDialog` 发起确认的组件，确认 layout、slot 与 Promise 关闭链路一致。

## Maintenance

- 当路由生成方式、前端分层、bootstrap 机制、store 约束、UI 目录结构或 `window.api` 消费方式变化时，必须更新本文档。
- 当项目引入新的全局状态管理模式或替换 Pinia 约束时，必须同步修改 Rules、Examples 和 Verification。
- 当 `UModal` 的全局主题、slot 约定、确认弹窗模式或 `useOverlay` 接入方式变化时，必须同步更新本文档。
- 若某个 capability 在 OpenSpec 中改变了页面职责、加载时机或用户可见状态约定，应先更新对应 `spec.md`，再同步本文档。
