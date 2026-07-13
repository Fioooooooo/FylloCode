# Project Integrations

状态：未来重组方向，仅作边界留存；当前生产代码尚未迁入本目录。

## 目标

表达“为当前项目的不同执行阶段挂载 provider resource”这一跨 domain 用户流程，由 feature 负责编排 platform provider 与 automation project-integration 状态。

## 当前来源

- `src/renderer/src/pages/integration.vue`
- `src/renderer/src/components/integration/**`
- project integration 相关页面级 watch 和 provider stage 交互

## 预期边界

- `model`：stage/resource selection、过滤和只读展示投影。
- `application`：项目切换、provider resource 加载、stage mount/save 用例。
- `ui`：ProviderStageSection、CategorySection、SearchFilter、ToolCard 等项目集成 UI。
- `integration`：route 页面装配以及跨 domain store adapter。
- 页面最终不直接维护 provider/project integration 的组合流程。

## 保持在 feature 外

- `src/renderer/src/api/platform/providers.ts`
- `src/renderer/src/api/automation/project-integration.ts`
- `src/renderer/src/stores/platform/providers.ts`
- `src/renderer/src/stores/automation/project-integration.ts`

设置页的 credential、connect/disconnect/probe 属于未来 `provider-connections` 方向，不应与项目资源挂载混成同一 feature。
