# Provider Connections

状态：未来重组方向，仅作边界留存；当前生产代码尚未迁入本目录。

## 目标

收拢设置页中的 provider 凭证、connect/disconnect、probe 和连接状态展示，明确它与“为项目阶段挂载 provider resource”的 Project Integrations 是两个独立用户流程。

## 当前来源

- `src/renderer/src/components/settings/SettingsIntegrationProviders.vue`
- `src/renderer/src/components/settings/IntegrationProviderCard.vue`
- provider connection 相关的设置页编排

## 预期边界

- `model`：connection state、capability 和 credential form 的纯展示投影。
- `application`：加载、连接、断开、probe 和错误恢复用例。
- `ui`：设置页 provider list、connection card 和 credential form。
- `integration`：Settings 页面 section 与 platform provider store 的装配。

## 保持在 feature 外

- `src/renderer/src/api/platform/providers.ts`
- `src/renderer/src/stores/platform/providers.ts`
- provider manifest 与 shared integration contracts
- `project-integrations` 的项目 stage/resource 挂载流程

迁移时必须保持 credential 安全边界、连接状态和 probe 行为不变；跨两个 feature 的 provider 视觉原语只有在确实复用后才提升到 shared UI。
