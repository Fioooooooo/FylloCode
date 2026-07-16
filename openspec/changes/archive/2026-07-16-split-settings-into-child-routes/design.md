## Context

`src/renderer/src/pages/settings.vue` 当前同时拥有设置侧栏、tab 查询参数解析、动态组件选择和内容容器。四个设置区域已经由 `components/settings/SettingsAgents.vue`、`SettingsIntegrationProviders.vue`、`SettingsPreferences.vue` 与 `SettingsAbout.vue` 分别实现，并且切换动态组件时会卸载旧组件、挂载新组件。

现有外部定向入口位于 `src/renderer/src/components/integration/ProviderStageSection.vue`，通过 `/settings?tab=integration-providers&focus=<providerId>` 打开 provider 凭证配置。应用不持久化 renderer route、不提供外部 deep link 或浏览器式前进/后退 UI，因此本次不需要保留旧 `?tab=` 地址或新增历史导航能力。

项目使用 `vue-router/auto-routes` 文件系统路由。`ActivityBar.vue` 通过 `route.path.startsWith(item.path)` 计算激活项，所以 `/settings/*` 会自然保持 `/settings` 对应的设置项高亮。

## Goals / Non-Goals

**Goals:**

- 让设置页成为共享父布局，并让四个设置区域由文件系统子路由挂载。
- 保留 `/settings` 作为 ActivityBar 和内部调用方的稳定设置入口，并将其重定向到默认 Agents 子页面 `/settings/acp-agents`。
- 使用 `/settings/connections` 表达全局 provider 凭证与连接状态管理，并把用户可见名称统一为“服务连接”。
- 让 `focus` 查询参数只服务 `/settings/connections` 的 provider 定位用例。
- 让四个设置子 route SFC 直接拥有页面实现，并只把真实子组件归档到 `components/settings/{acp-agents,connections}/`。
- 保持现有设置组件的数据来源、生命周期、错误/空状态和视觉布局不变。

**Non-Goals:**

- 不在 `src/renderer/src/features/**` 新增目录、入口或实现，也不把任何设置组件迁入该目录；这些设置区域当前不视为需要 feature 分层的完整能力。
- 不改写设置组件内部业务逻辑、platform stores、renderer API wrapper 或 shared provider contract；组件移动只调整文件路径和 import。
- 不兼容或重定向旧 `/settings?tab=*` 地址。
- 不新增前进、后退、breadcrumb、快捷键或其他浏览器式历史导航 UI。
- 不改变 Agents 内部“全部 / 已安装 / 自定义”tab，也不把这些局部筛选改为 route。

## Decisions

### 1. 使用 `settings.vue` 父 route 与直接拥有实现的子 route

保留 `src/renderer/src/pages/settings.vue`，将其改为只负责左侧导航、共享内容容器和 `<RouterView />`，并通过 `definePage({ redirect: "/settings/acp-agents" })` 为父 route 配置默认入口。新增：

- `src/renderer/src/pages/settings/acp-agents.vue`：直接拥有 Agents 页面状态、生命周期和布局，对应 `/settings/acp-agents`；
- `src/renderer/src/pages/settings/connections.vue`：直接拥有 provider 加载、`focus` query 解析和列表布局，对应 `/settings/connections`；
- `src/renderer/src/pages/settings/preferences.vue`：直接拥有偏好设置表单，对应 `/settings/preferences`；
- `src/renderer/src/pages/settings/about.vue`：直接拥有应用信息和版本检查页面，对应 `/settings/about`。

这些页面都只有一个 route 消费者，原 `pages/settings/*.vue -> Settings*.vue` 没有参数适配、多入口复用或 feature public entry，因此不保留 1:1 转发层。route SFC 本身就是页面 owner；它可以组合 `components/settings/**` 中的真实子组件。这符合 `RendererFeatures.md` 中“小规模能力继续使用 pages/components”的边界，并落实本次不得进入 `features/**` 的明确约束。

备选方案是继续使用单 route 的 `?tab=` 动态组件。它可以工作，但会继续让一个 SFC 同时维护 route 状态和页面装配，也会让 `focus` 等 section 专属参数泄漏到无关 tab，因此不采用。

### 2. 导航状态完全由当前 route 派生

设置侧栏项使用固定 route 目标，不再维护 `SettingsTab`、`resolveActiveTab()`、`activeTab`、`activeComponent` 或 `selectTab()`。菜单按“偏好设置、Agents、服务连接、关于我们”排列；Agents 项在 `route.path === "/settings/acp-agents"` 时激活，其余项按各自完整路径激活。导航使用正常 router link 行为，但不把浏览器历史操作作为产品能力或验收目标。ActivityBar 与既有内部调用方继续使用 `/settings`，由父 route 重定向到 Agents 子页面。

共享容器继续保留 `w-65` 左栏、`max-w-2xl` 内容宽度和现有设置导航视觉模式。`ActivityBar` 的路径前缀算法无需修改。

### 3. 服务连接使用独立路径并保留 provider 聚焦

`ProviderStageSection.openSettings(providerId)` 改为导航至 `/settings/connections`，并只传递 `focus: providerId`。`pages/settings/connections.vue` 从 `route.query.focus` 读取 provider ID，在加载与 probe 完成后滚动并聚焦对应卡片。

旧 `tab` 查询参数没有跨进程、持久化或外部协议消费者，仓库内调用点可在同一变更中原子更新，因此不增加 redirect 或 compatibility parser。

### 4. 术语只调整用户界面，不重命名领域类型

设置侧栏与 `pages/settings/connections.vue` 页面标题统一使用“服务连接”。内部 `Provider`、`ProviderConnection`、`useIntegrationProvidersStore`、platform providers API 和 `provider-connections` 方向文档继续保持原名，因为页面管理的是 provider connection，而不是引入新的 Connector 领域模型。

### 5. components 只承载真实子组件

使用以下目录映射保留页面实际组合的子组件，文件名和组件职责保持不变：

- `components/settings/acp-agents/AgentCard.vue`；
- `components/settings/connections/IntegrationProviderCard.vue`。

`SettingsAgents.vue`、`SettingsIntegrationProviders.vue`、`SettingsPreferences.vue` 与 `SettingsAbout.vue` 的实现分别合并进对应 route SFC 后删除。Preferences/About 当前没有子组件，因此不保留空的 `components/settings/preferences` 或 `about` 目录。没有多个设置子页面共同使用的组件，因此本次不建立 `components/settings/shared`；未来只有在出现真实多消费者时再判断共享位置。

备选方案是保留四个 1:1 `Settings*.vue` 页面组件，让 route SFC 只负责转发。由于这些组件没有复用消费者，且服务连接组件仍直接依赖 route query，该层不能形成真实边界，因此不采用。

## Risks / Trade-offs

- [文件系统嵌套约定或 redirect 配置错误会生成非预期路径] → 通过生成后的 `typed-router.d.ts`、route record 测试和 renderer typecheck 验证 `/settings` 重定向与四个子路径。
- [父 layout 与子 route 同时添加内容容器会造成重复 padding 或滚动区] → 共享 `max-w-2xl px-6 py-8` 容器只保留在 `settings.vue`，子 route 保留现有页面内部布局但不重复外层 shell。
- [项目集成页仍指向旧查询参数会失去定向能力] → 同一任务更新 `ProviderStageSection.openSettings()` 及其测试，验证 `focus` 原样传递到 `/settings/connections`。
- [旧 `?tab=` 地址不再切换 section] → 这是明确接受的 breaking behavior；应用没有 route 恢复、外部 deep link 或书签入口，不提供迁移层。
- [路由拆分被扩大为 feature 迁移] → tasks 明确限定改动范围，不创建或修改 `features/**` 下的实现。
- [合并页面实现后遗留旧 import 或自动组件声明] → 同步更新 route、镜像测试与 `src/renderer/components.d.ts`，并用 typecheck、lint 和 renderer tests 捕获遗漏。
