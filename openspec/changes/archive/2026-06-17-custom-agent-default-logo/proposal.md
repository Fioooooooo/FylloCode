## Why

当前自定义 Agent 没有专属图标时，系统使用 `lucide:bot` 作为默认图标，视觉上与 FylloCode 品牌不一致。为了让自定义 Agent 在会话列表、选择器等位置看起来更统一，决定用 FylloCode Logo 替换默认机器人图标。

## What Changes

- 新增可复用的 `Logo.vue` 组件，支持 `color` 属性：
  - `default`：保持 FylloCode 品牌原色。
  - `neutral`：使用中性色（如 `currentColor`），用于融入现有 UI 的 Agent fallback 场景。
- 新增 `CustomAgentIcon.vue` 组件，封装 `Logo.vue` 并固定 `color="neutral"`，作为自定义 Agent fallback 图标的唯一出口。
- 在以下组件中，将自定义 Agent 的 `i-lucide-bot` fallback 替换为 `CustomAgentIcon.vue`：
  - `src/renderer/src/components/chat/SessionItem.vue`
  - `src/renderer/src/components/chat/empty/AgentPickerCard.vue`
  - `src/renderer/src/components/chat/empty/ChatEmptyAgentPicker.vue`
  - `src/renderer/src/components/chat/empty/AgentPickerModal.vue`
- 修改 `openspec/specs/custom-acp-agent/spec.md` 的默认图标条款，将默认图标从 `lucide:bot` 更新为 FylloCode Logo。
- 明确不修改 `src/renderer/src/pages/settings.vue` 的 Agents tab 导航图标，仍保持 `i-lucide-bot`。

## Capabilities

### New Capabilities

无

### Modified Capabilities

- `custom-acp-agent`：默认图标需求从 `lucide:bot` 变更为 FylloCode Logo（neutral 样式）。

## Impact

- 仅影响渲染进程 UI，无 IPC、存储或数据格式变更。
- 新增两个 Vue 组件（`Logo.vue`、`CustomAgentIcon.vue`），需确保图标在小尺寸（14px–36px）下仍清晰可辨。
