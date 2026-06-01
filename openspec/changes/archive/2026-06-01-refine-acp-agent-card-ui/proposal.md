## Why

FylloCode 当前有三个独立组件渲染 ACP Agent 卡片：Chat 空态首屏的 `InstalledAgentTile`、Chat 空态弹窗的 `AgentPickerCard`、设置页的 `AgentCard`。其中 `AgentPickerCard` 与 `AgentCard` 的视觉骨架（图标 + 名称行 + 分类徽章 + 元数据 + 描述）高度重叠，却各写一套样式，已出现不一致：图标尺寸 `w-9` vs `w-8`、内边距 `p-3` vs `p-4`、元数据排版各异。

设置页 `AgentCard` 还存在两个具体可观测问题：

- **操作区在窄卡里拥挤、状态切换时布局抖动**。设置页用 `grid-cols-2` 网格，卡片本就不宽。右上角操作区是一条互斥状态链，其中「可更新」状态要并排放「更新 + 卸载」两个按钮，而其它状态只有 1 个按钮，按钮数量不固定导致整张卡片宽度在状态切换时跳动。
- **信息密度低、主次不分**。`name / version / license / authors / description` 几乎全部使用 `text-xs text-muted`，其中 `license` 和 `authors` 各占视觉空间但对「装不装、管不管」的决策价值很低。

## What Changes

- 抽出纯展示组件 `AgentCardBase`（图标 + 名称行 + `AgentKindBadge` + 元数据槽 + 描述，零交互），暴露 `#meta` 与 `#actions` 具名插槽；`AgentPickerCard` 与 `AgentCard` 改为消费它，统一图标尺寸、内边距、元数据排版。
- 设置页 `AgentCard` 操作区改造：主操作（安装 / 更新 / 重试 / 「已安装」徽章）常驻，次操作「卸载」收进 `...`（kebab）菜单；操作区定宽，消除「可更新」状态的双按钮布局抖动。保留并发禁用 + "其他 Agent 正在处理中" tooltip 语义；卸载点击后仍走原有 `(managedBy, installMethod)` 文案矩阵二次确认对话框，不改这套契约。
- 设置页 `AgentCard` 信息层级：抬升 `name` 的视觉权重；以 `website → repository` 回退的外链图标（`i-lucide-external-link`，点击经 `shell.openExternal` 打开）**替换**低价值的 `license` / `authors` 文本。外链仅在设置页卡片提供，不进 Chat 弹窗 `AgentPickerCard`。
- 为 `AcpAgentEntry` 类型补充可选字段 `website?: string`（registry 原始 JSON 已含该字段，仅类型未覆盖），使 UI 可安全消费。
- 分类徽章（`AgentKindBadge`）的呈现层级**不变**：`native` 无图标、`adapter` / `bridge` 维持图标 + tooltip。本次不引入「常驻分类文案」。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-status-panel`: 卡片展示内容（名称下方的「version + license」改为「version + website/repository 外链」，license/authors 不再常驻展示）与操作区呈现（卸载从常驻按钮改为 kebab 菜单项，操作区定宽）。
- `agent-install`: 「卸载入口可见性」需求中将「卸载按钮」措辞放宽为「卸载操作项/入口」，保留 `installed === true` 才显示、并发操作时禁用并 tooltip 提示的全部语义。

## Impact

- **前端组件**：新增 `frontend/src/components/acp/AgentCardBase.vue`（建议位置）；修改 `frontend/src/components/settings/AgentCard.vue`、`frontend/src/components/chat/empty/AgentPickerCard.vue`。`InstalledAgentTile.vue`、`MoreAgentsTile.vue`、`AgentKindBadge.vue` 不变。
- **共享类型**：`shared/types/acp-agent.ts` 的 `AcpAgentEntry` 增加 `website?: string`。
- **外链能力**：设置页外链点击经 Electron `shell.openExternal`，复用项目既有的外部链接打开机制（实现阶段确认现有封装）。
- **测试**：`frontend/src/__tests__/components/agent-card.spec.ts` 需更新以覆盖 kebab 菜单中的卸载入口与外链渲染。
- **不影响**：卸载二次确认对话框文案矩阵（`agent-install` 的「卸载二次确认对话框」需求）、分类徽章共享与呈现规则（`chat-agent-selection`、`acp-agent-kind-classification`）、Chat 空态首屏 `InstalledAgentTile` 行为。
