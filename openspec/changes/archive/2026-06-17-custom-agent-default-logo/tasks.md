## 1. 创建 Logo 组件

- [x] 1.1 在 `src/renderer/src/components/shared/Logo.vue` 创建 `Logo` 组件
  - 定义 props：`color: 'default' | 'neutral'`，默认 `'default'`
  - `default` 模式：渲染 `src/renderer/public/icon.svg` 的品牌色路径
  - `neutral` 模式：将路径 `fill` 改为 `currentColor`，保留 viewBox 与几何形状
  - 组件自身不设定宽高，由调用方通过 Tailwind 类（如 `h-4 w-4`）控制
- [x] 1.2 在 `src/renderer/src/components/acp/CustomAgentIcon.vue` 创建 `CustomAgentIcon` 组件
  - 内部固定渲染 `<Logo color="neutral" />`
  - 不暴露 `color` prop，保持接口单一
- [x] 1.3 验证 `Logo` 与 `CustomAgentIcon` 组件均可正常渲染，无 prop 类型错误

## 2. 替换自定义 Agent fallback 图标

- [x] 2.1 修改 `src/renderer/src/components/chat/SessionItem.vue`
  - 将无 `agentIcon` 时的 `UIcon name="i-lucide-bot"` 替换为 `<CustomAgentIcon />`
  - 保持现有容器 `h-7 w-7` 与 `object-cover` 样式不变
- [x] 2.2 修改 `src/renderer/src/components/chat/empty/AgentPickerCard.vue`
  - 移除自定义 Agent 的 `fallbackIcon` 相关逻辑
  - `AgentCardBase` 无图标时统一渲染 `CustomAgentIcon`，不再允许调用方传入 fallback
- [x] 2.3 修改 `src/renderer/src/components/chat/empty/ChatEmptyAgentPicker.vue`
  - 移除 `fallbackIcon` 相关逻辑
  - `InstalledAgentTile` 无图标时统一渲染 `CustomAgentIcon`，不再允许调用方传入 fallback
- [x] 2.4 修改 `src/renderer/src/components/chat/empty/AgentPickerModal.vue`
  - 将 Custom tab 空态的 `UIcon name="i-lucide-bot"` 替换为 `<CustomAgentIcon />`

## 3. 更新 OpenSpec 规范

- [x] 3.1 修改 `openspec/specs/custom-acp-agent/spec.md`
  - 将「默认图标」Requirement 中的 `lucide:bot` 更新为 FylloCode Logo（通过 `CustomAgentIcon.vue` 渲染）
  - 同步更新其 Scenario 描述

## 4. 验证

- [x] 4.1 运行 `pnpm typecheck`，确保无类型错误
- [x] 4.2 运行 `pnpm lint`，确保无 lint 错误
- [ ] 4.3 在开发环境中手动验证以下尺寸下的 Logo 显示效果：
  - `SessionItem` 中的约 14px
  - `AgentPickerCard` / `InstalledAgentTile` 中的约 36px
  - `AgentPickerModal` 空态中的约 32px
- [x] 4.4 确认 `settings.vue` 的 Agents tab 导航图标仍为 `i-lucide-bot`，未被修改
