## 1. 建立设置父布局与子路由

- [x] 1.1 按页面移动现有组件：将 `SettingsAgents.vue` 与 `AgentCard.vue` 移到 `src/renderer/src/components/settings/agents/`，将 `SettingsIntegrationProviders.vue` 与 `IntegrationProviderCard.vue` 移到 `src/renderer/src/components/settings/connections/`，将 `SettingsPreferences.vue` 移到 `src/renderer/src/components/settings/preferences/`，将 `SettingsAbout.vue` 移到 `src/renderer/src/components/settings/about/`；保留组件文件名、组件内部逻辑和同页私有相对 import，移动后 `components/settings/` 根目录不再平铺这些文件，且不得在 `src/renderer/src/features/**` 新增、移动或修改实现。
- [x] 1.2 重构 `src/renderer/src/pages/settings.vue`：移除 `SettingsTab`、`resolveActiveTab()`、`activeTab`、`activeComponent`、`selectTab()` 及四个内容组件的直接导入；保留现有 `w-65` 左侧导航和 `max-w-2xl px-6 py-8` 内容容器，用 route-derived 状态标记当前项，并在内容容器中渲染 `<RouterView />`。导航目标固定为 `/settings`、`/settings/connections`、`/settings/preferences`、`/settings/about`，第二项文案使用“服务连接”。
- [x] 1.3 新增薄 route wrappers：`src/renderer/src/pages/settings/index.vue` 从 `@renderer/components/settings/agents/SettingsAgents.vue` 挂载 Agents，`connections.vue` 从 `components/settings/connections/SettingsIntegrationProviders.vue` 挂载服务连接，`preferences.vue` 与 `about.vue` 分别从对应设置子目录挂载现有组件；wrapper 不复制 store、API、生命周期或业务逻辑。
- [x] 1.4 通过 `vue-router/auto-routes` 更新生成的 `src/renderer/src/typed-router.d.ts`，确认 `/settings` 具有 index child，并生成 `/settings/connections`、`/settings/preferences`、`/settings/about`；同步更新自动生成的 `src/renderer/components.d.ts` 到设置组件新路径；保持 `src/renderer/src/config/activity-bar.ts` 的设置入口为 `/settings`，不新增子页面 ActivityBar item。

## 2. 更新服务连接术语与内部定向入口

- [x] 2.1 修改移动后的 `src/renderer/src/components/settings/connections/SettingsIntegrationProviders.vue`，将页面主标题“集成提供方”改为“服务连接”；保留 `route.query.focus`、`loadProviders()`、`probeConnectedProviders()`、滚动定位和 provider 卡片行为，且不重命名内部 Provider/ProviderConnection 类型、store 或 API。
- [x] 2.2 修改 `src/renderer/src/components/integration/ProviderStageSection.vue` 的 `openSettings(providerId)`：导航到 `/settings/connections`，query 只包含 `{ focus: providerId }`，不再发送 `tab: "integration-providers"`；保持未连接、连接过期和添加 provider 入口复用该函数。

## 3. 更新 Renderer 测试

- [x] 3.1 重写 `test/renderer/src/pages/settings.spec.ts` 以覆盖共享父布局：断言四个导航目标、当前 route 对应的激活项、“服务连接”文案和 `<RouterView />` 内容出口；删除旧 `?tab=` 动态组件选择及跨 tab 保留 `focus` 的断言，并覆盖 `/settings?tab=about` 不再改变默认 Agents 子页面的行为。
- [x] 3.2 更新 `test/renderer/src/components/{agent-card,settings-about,settings-integration-providers,settings-preferences,integration-provider-card}.spec.ts` 的 import 到 `components/settings/{agents,connections,preferences,about}/` 对应新路径，并为 `src/renderer/src/pages/settings/{index,connections,preferences,about}.vue` 的 route wrapper 增加或调整测试，分别验证只挂载对应设置组件且不会同时挂载其他 section。
- [x] 3.3 更新 `test/renderer/src/components/provider-stage-section.spec.ts`，将两个未连接 provider 场景的期望改为 `{ path: "/settings/connections", query: { focus: "yunxiao" } }`，继续断言已连接 provider 不触发设置导航。
- [x] 3.4 扩展 `test/renderer/src/components/activity-bar.spec.ts`，验证 `/settings/connections`、`/settings/preferences` 与 `/settings/about` 均高亮现有设置项，且不渲染新的一级导航按钮。

## 4. 验证

- [x] 4.1 按 `AGENTS.md` 在尚未准备的 main worktree 先执行 `sh scripts/prepare-worktree-env.sh`，随后运行 `pnpm exec vitest run --project renderer`，确认设置路由、服务连接定向入口、ActivityBar 以及既有设置组件测试全部通过。
- [x] 4.2 运行 `pnpm typecheck:web`、`pnpm lint` 与 `git diff --check`，确认自动路由/组件类型、Vue/TypeScript、lint 和补丁格式通过；检查 `components/settings/` 根目录不再含页面组件，并确认变更文件列表不包含 `src/renderer/src/features/**`。

## 5. 消除一对一页面转发层

- [x] 5.1 将 `components/settings/agents/SettingsAgents.vue`、`connections/SettingsIntegrationProviders.vue`、`preferences/SettingsPreferences.vue`、`about/SettingsAbout.vue` 的 script/template 分别合并到 `pages/settings/{index,connections,preferences,about}.vue`；更新 `AgentCard` 与 `IntegrationProviderCard` import 到现有 settings 子组件路径，保持页面行为、状态和布局不变。
- [x] 5.2 删除合并后不再使用的四个 `Settings*.vue` 页面组件以及空的 `components/settings/preferences`、`components/settings/about` 目录；刷新自动生成的 `src/renderer/components.d.ts`，确认只保留真实设置子组件且 `src/renderer/src/features/**` 无变更。
- [x] 5.3 按源码镜像迁移测试：将 About、服务连接、偏好设置测试移到 `test/renderer/src/pages/settings/{about,connections,preferences}.spec.ts`，为 Agents route 增加 `index.spec.ts` 页面挂载覆盖；将卡片测试移到 `test/renderer/src/components/settings/{agents,connections}/`，删除仅验证 1:1 wrapper 的 `settings-routes.spec.ts` 并更新所有 import。

## 6. 修正验证

- [x] 6.1 运行 `pnpm exec vitest run --project renderer`，确认设置父布局、四个 route 页面、真实设置子组件、ActivityBar 与 provider 定向跳转测试全部通过。
- [x] 6.2 运行 `pnpm typecheck:web`、`pnpm lint`、`pnpm exec electron-vite build` 与 `git diff --check`；确认无旧 `Settings*.vue` 页面组件引用、无空 Preferences/About 组件目录，并确认变更文件列表不包含 `src/renderer/src/features/**`。

## 7. 明确 ACP Agents 子路由

- [x] 7.1 将 `pages/settings/index.vue` 重命名为 `pages/settings/acp-agents.vue`，将 `components/settings/agents/` 重命名为 `components/settings/acp-agents/`，并同步更新页面 import、镜像测试路径与自动生成的 typed route/component 声明；保持 Agents 页面内部行为不变。
- [x] 7.2 在 `pages/settings.vue` 使用 `definePage({ redirect: "/settings/acp-agents" })` 配置父 route 重定向，将 Agents 左侧导航目标和激活态改为 `/settings/acp-agents`；保持 ActivityBar 与既有内部调用方使用 `/settings`，由稳定入口统一重定向。
- [x] 7.3 更新设置父布局、Agents 页面和自动 route record 测试，验证 `/settings` 的 redirect、`/settings/acp-agents` 的页面归属与导航激活态，并确认其余三个设置子路由不变。

## 8. ACP Agents 路由验证

- [x] 8.1 运行 `pnpm exec vitest run --project renderer`，确认设置 redirect、四个子页面、ActivityBar 与既有内部设置入口全部通过。
- [x] 8.2 运行 `pnpm typecheck:web`、`pnpm lint` 与 `git diff --check`；确认无 `pages/settings/index.vue`、无 `components/settings/agents/`、自动路由声明包含 `/settings/acp-agents`，并确认变更文件列表不包含 `src/renderer/src/features/**`。依据用户长期约束，未经明确授权不运行 build。

## 9. 调整设置子菜单顺序与文案

- [x] 9.1 将 `pages/settings.vue` 的导航顺序调整为“偏好设置、Agents、服务连接、关于我们”，保持四项既有路径和图标不变，并将 About 导航文案改为“关于我们”。
- [x] 9.2 更新 `test/renderer/src/pages/settings.spec.ts`，按渲染顺序断言四个导航项的文案和目标，同时保留现有 route 激活态与内容出口覆盖。

## 10. 子菜单调整验证

- [x] 10.1 运行设置父布局定向测试、`pnpm typecheck:web`、`pnpm lint` 与 `git diff --check`；确认顺序/文案正确且 `src/renderer/src/features/**` 无变更。未经用户明确授权不运行 build。
