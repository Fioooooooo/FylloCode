## Why

当前设置页用 `?tab=` 和动态组件承载 Agents、服务连接、偏好设置与 About 四个独立区域，URL 语义、外部定向入口和页面边界都集中在单个 route SFC 中。将这些区域改为共享设置外壳下的子路由，可以让导航结构与已经独立的组件生命周期一致，并简化服务连接的定向跳转。

## What Changes

- 将 `/settings` 改为共享左侧导航和内容容器的父路由，并通过父 route 的 `definePage()` 配置重定向到默认 Agents 子页面 `/settings/acp-agents`。
- 新增 `/settings/acp-agents`、`/settings/connections`、`/settings/preferences` 与 `/settings/about` 子路由，并让四个子 route SFC 直接拥有各自页面实现，不再通过 1:1 `Settings*.vue` 页面组件转发。
- 将设置导航和页面标题中的“集成提供方”统一改为“服务连接”。
- 将项目集成页定向打开 provider 的入口改为 `/settings/connections?focus=<providerId>`，继续保留 provider 聚焦行为。
- **BREAKING**：移除 `/settings?tab=integration-providers|preferences|about` 的 tab 查询参数路由语义，不提供旧查询参数到新子路由的兼容跳转。
- 保持 `/settings` 作为 ActivityBar 的设置入口，并让所有 `/settings/*` 子路由继续命中设置激活态。
- 设置左侧子菜单固定按“偏好设置、Agents、服务连接、关于我们”排序，并将原 “About” 导航文案改为“关于我们”。
- 在 `components/settings/acp-agents` 与 `components/settings/connections` 中只保留 route 页面实际组合的 `AgentCard` 与 `IntegrationProviderCard` 子组件；不为没有子组件的 Preferences/About 建立占位目录。
- 本次改造只建立 route 页面、共享设置外壳和真实子组件目录；设置内容不得迁入或新建 `features/**`。

## Capabilities

### New Capabilities

- `settings-navigation`: 定义设置父布局、默认 Agents 页面、服务连接/偏好设置/About 子路由、内部定向跳转与导航文案。

### Modified Capabilities

无。

## Impact

- Renderer 路由与页面：`src/renderer/src/pages/settings.vue`、直接承载页面实现的 `src/renderer/src/pages/settings/*.vue`，以及自动生成的 typed router 声明。
- 设置 UI：`src/renderer/src/components/settings/acp-agents/AgentCard.vue`、`connections/IntegrationProviderCard.vue` 与自动生成的 component 类型声明。
- 内部导航：`src/renderer/src/components/integration/ProviderStageSection.vue` 的服务连接定向路径。
- 测试：设置父布局、各子页面、真实设置子组件、ActivityBar 激活态和 provider 定向跳转相关 renderer 测试，并按 `pages/settings/**` 与 `components/settings/**` 镜像归档。
- 不涉及 main/preload/IPC、shared schema、持久化格式、依赖升级或 `features/**` 目录变更。
