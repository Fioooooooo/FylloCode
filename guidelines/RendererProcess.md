---
name: RendererProcess
description: Vue 渲染进程的分层、路由、状态管理、UI 约束与启动流程
keywords: [renderer, vue, pinia, routing, ui]
---

# RendererProcess

## Purpose

定义 `frontend/src/` 的目录职责、UI 分层、状态管理、页面路由、启动预热与渲染层访问主进程能力的唯一方式。任何涉及页面、组件、store、api、bootstrap 或前端专属类型的工作，都必须先阅读本文档。

## Applicability

- 适用于 `frontend/src/**`、`frontend/index.html`、前端专属测试与生成文件。
- 适用于 `pages/`、`layouts/`、`components/`、`stores/`、`api/`、`bootstrap/`、`composables/`、`utils/`、`types/`。
- 不覆盖格式化、命名、Prettier/ESLint 细则；见 `guidelines/CodeStyle.md`。
- 不覆盖 IPC channel 契约与 preload 公开接口语义；见 `guidelines/IPC.md`。

## Sources of Truth

- `frontend/src/**`
- `electron.vite.config.ts`
- `frontend/src/main.ts`
- `frontend/src/App.vue`
- `frontend/src/bootstrap/**`
- `frontend/src/stores/**`
- `frontend/src/api/**`
- `frontend/src/pages/**`
- `frontend/src/components/**`
- `frontend/src/typed-router.d.ts`
- `openspec/specs/app-shell-routing/spec.md`
- `openspec/specs/project-page-routing/spec.md`
- `openspec/specs/settings-page/spec.md`
- `openspec/specs/workspace-layout/spec.md`
- `openspec/specs/app-bootstrap/spec.md`

## Rules

- MUST: 将渲染进程视为 Vue 单页应用，所有页面与组件代码落在 `frontend/src/` 下，不得直接访问 Node 或 Electron 原生 API。
- MUST: 通过 `frontend/src/api/<domain>.ts` 作为 `window.api.<domain>` 的唯一薄封装入口；页面、组件、store、composables 均不得直接调用 `window.api.*`。
- MUST: 让 `stores/` 成为全局状态、异步编排、loading/error 状态建模和首次加载去重的唯一入口；页面与组件应消费 store，而不是自己分散发起相同请求。
- MUST: 使用文件系统路由，页面放在 `frontend/src/pages/`，由 `vue-router/auto` 生成 `frontend/src/typed-router.d.ts`；该文件禁止手动修改。
- MUST: 在 `frontend/src/main.ts` 中先完成 `mount("#app")`，再触发 bootstrap 任务；启动预热不得阻塞首屏渲染。
- MUST: 将启动时的全局预热任务注册到 `frontend/src/bootstrap/`，避免由多个页面重复承担同一份全局初始化职责。
- MUST: 将跨进程共享类型放在 `@shared/types/*`，只在纯前端使用的类型才放在 `frontend/src/types/`。
- MUST: 渲染进程打开外部链接时使用标准锚点语义（如 `<a target="_blank" rel="noreferrer">` 或 `UButton as="a"`）；链接会由主进程 `electron/main/bootstrap/window.ts` 中的 `setWindowOpenHandler` 统一转交给 `shell.openExternal` 并拒绝应用内导航，渲染进程不得直接引用 `shell`，也无需为此新增 IPC。
- MUST: 将 UI 层职责保持清晰：`pages/` 负责路由单元和页面编排，`components/` 负责展示与交互，`layouts/` 负责骨架，`stores/` 负责状态和异步动作，`api/` 负责薄转发。
- SHOULD: 将模板中的复杂逻辑下沉到 `stores/`、`composables/` 或 `utils/`，避免在 Vue template 内内联复杂表达式。
- SHOULD: 使用现有业务域目录，例如 `components/chat/`、`components/proposal/`、`components/settings/`、`components/integration/`，保持 UI 代码按功能聚合。
- MAY: 在 `frontend/src/composables/` 增加跨组件复用逻辑，但如果它会持有全局状态或跨页面生命周期，应优先考虑 store。

## Examples

- Good: `frontend/src/stores/integration.providers.ts` 作为 settings 与 `/integration` 页共享的 provider 状态入口。
- Good: `frontend/src/api/project.ts` 仅返回 `window.api.project.*` 的类型化 Promise，而不承担缓存或 toast 逻辑。
- Good: `frontend/src/bootstrap/tasks/projects.ts` 调用 store 的 `ensureInitialized()` 预热 persisted project 列表。
- Good: 组件里用 `<a target="_blank" rel="noreferrer">` 或 `UButton as="a"` 打开外站，让 `setWindowOpenHandler` 统一走系统浏览器。
- Bad: 在 Vue 组件内直接 `window.api.integration.projectSet(...)`。
- Bad: 在 renderer 中直接导入 Electron `shell` 或为了外链再封一层专用 IPC。
- Bad: 在页面里直接写 `fetch(...)`、`ipcRenderer.invoke(...)` 或用多个组件各自加载同一份全局配置数据。

## Chat Prompt Capabilities

- `useAcpAgentsStore.promptCapabilitiesByAgent` 维护 renderer 内存态的 `Map<agentId, AcpPromptCapabilities>`；启动期通过 `loadCapabilitiesCache()` 预热，切换 agent 时通过 `refreshCapabilities(agentId)` 触发主进程 `acp:ensureAgent`。
- 未命中 capability 时，`getPromptCapabilities(agentId)` 必须返回 `{ image: false, audio: false, embeddedContext: false }`，UI 入口按不支持处理。
- `frontend/src/utils/chat-message-parts.ts` 提供 `isUserImagePart` / `isUserFilePart`，只用于 user message 的 AI SDK `FileUIPart` 渲染分派；assistant file part 当前不渲染。

## Draft Session Probe

- `useSessionStore.draftProbeByAgent` 维护草稿态 probe 的 renderer 内存镜像；`activeDraftProbe` 只跟随当前 `draftAgentId`，切 agent 时必须先清旧 entry，再 debounce 发起新 `probeEnsure`。
- 草稿态 probe 通过 `frontend/src/api/chat.ts` 调用 preload 暴露的 `chat:probe:*` IPC；组件不得直接访问 `window.api.chat` 或 IPC channel。
- `ConfigOptionsBar` 在已建立 session 时读取 `activeSession.configOptions`，草稿态只在 `activeDraftProbe.status === "ready"` 时读取 probe config options；starting/failed/null 均不渲染。
- `sendMessage` 在草稿态创建首个 fyllo session 时，必须使用创建前捕获的 probe 快照：当快照为 `ready` 且 `acpSessionId` 非空时，把 `configOptions` 与 `acpSessionId` 一并透传给 `useSessionStore.createSession`，`createSession` resolve 后再调用 `applyProbeUpdate(agentId, null)` 清空 draft probe；后续 `chatApi.streamMessage` 仍传同一个 `acpSessionId`。`createSession` 抛错路径下不清空 draft probe，让下次发送复用同一快照。

## Verification

- `pnpm lint`
- `pnpm typecheck:web`
- `pnpm vitest run frontend/src/__tests__/**/*.{test,spec}.{ts,vue}`
- 如果改动涉及路由文件，运行 `pnpm dev` 或对应生成链路，确认 `frontend/src/typed-router.d.ts` 正常更新。
- 如果改动涉及 bootstrap/store 初始化，检查是否引入了重复加载、loading 无法回收或错误状态遗漏。

## Maintenance

- 当路由生成方式、前端分层、bootstrap 机制、store 约束、UI 目录结构或 `window.api` 消费方式变化时，必须更新本文档。
- 当项目引入新的全局状态管理模式或替换 Pinia 约束时，必须同步修改 Rules、Examples 和 Verification。
- 若某个 capability 在 OpenSpec 中改变了页面职责、加载时机或用户可见状态约定，应先更新对应 `spec.md`，再同步本文档。
