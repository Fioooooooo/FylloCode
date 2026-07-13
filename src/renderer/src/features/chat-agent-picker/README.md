# Chat Agent Picker

状态：未来重组方向，仅作边界留存；当前生产代码尚未迁入本目录。

## 目标

收拢 Chat 空状态下的 agent 选择、更多 agent modal 和选择后启动会话的交互流程，同时保留 ACP agent 通用视觉原语的共享属性。

## 当前来源

- `src/renderer/src/components/chat/empty/AgentPickerCard.vue`
- `src/renderer/src/components/chat/empty/AgentPickerModal.vue`
- `src/renderer/src/components/chat/empty/ChatEmptyAgentPicker.vue`
- `src/renderer/src/components/chat/empty/InstalledAgentTile.vue`
- `src/renderer/src/components/chat/empty/MoreAgentsTile.vue`

## 预期边界

- `model`：installed/available agent 的 picker 投影与筛选。
- `application`：打开 picker、选择 agent、创建/切换 Chat session 的用例。
- `ui`：Chat 专属 picker card、modal 和 tiles。
- `integration`：Chat empty state 与 session creation 的装配。

## 保持在 feature 外

- `src/renderer/src/components/acp/AgentCardBase.vue` 等跨页面 agent UI 原语
- `src/renderer/src/stores/platform/acp-agents.ts`
- ACP API、bootstrap 和 shared contracts

只有 Chat picker 专属组件迁入；设置页或其他入口复用的 agent primitives 不得被该 feature 私有化。
