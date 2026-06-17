## Context

自定义 Agent 目前没有一个统一的品牌 fallback 图标。多个渲染组件在 Agent 无图标时硬编码使用 `i-lucide-bot`，导致视觉风格与 FylloCode 品牌脱节。现有品牌 logo 已存在于 `src/renderer/public/icon.svg`。

## Goals / Non-Goals

**Goals：**

- 提供可复用的 `Logo` 组件，支持品牌色与中性色两种渲染模式。
- 提供 `CustomAgentIcon.vue` 作为 Agent fallback 图标的单一出口，内部固定使用 `Logo color="neutral"`。
- 将 Agent 无图标时的 fallback 从 `i-lucide-bot` / `i-lucide-terminal` 统一替换为 `CustomAgentIcon.vue`。
- 更新 OpenSpec 规范，使默认图标条款与实现一致。

**Non-Goals：**

- 不修改 Registry Agent 的图标加载逻辑。
- 不修改 `settings.vue` 的 Agents tab 导航图标。
- 不提供用户自定义默认图标的能力。

## Decisions

1. **组件位置**：
   - `src/renderer/src/components/shared/Logo.vue`：通用品牌 Logo 组件。
   - `src/renderer/src/components/acp/CustomAgentIcon.vue`：Agent fallback 专用组件。
   - 理由：`components/shared/` 已存放通用组件（`MarkStream.vue`、`ConfirmDialog.vue`），与项目现有组织方式一致；将 Agent fallback 再封装一层，便于未来替换为更合适的 Agent 专用图标而无需改动多处调用。

2. **SVG 来源**：基于 `src/renderer/public/icon.svg` 抽取组件内 SVG。
   - 理由：`public/icon.svg` 已是 FylloCode 标准 logo，无需引入新资源。

3. **组件分层**：
   - `Logo.vue` 提供 `color` prop（`default` / `neutral`），保持通用性。
   - `CustomAgentIcon.vue` 不暴露 `color`，内部固定渲染 `<Logo color="neutral" />`。
   - `AgentCardBase` 与 `InstalledAgentTile` 无图标时统一渲染 `CustomAgentIcon.vue`，不再接受调用方传入的 `fallbackIcon`。
   - 理由：Agent 的 fallback 视觉应保持一致；未来若要换成 Agent 专用图标，只需替换 `CustomAgentIcon.vue` 的实现，无需改动调用方。

4. **`color` 属性设计**：
   - `default`：保留 SVG 原始品牌色（`#0f766e`、`#2dd4bf`、`#0891b2`）。
   - `neutral`：将路径填充改为 `currentColor`，由父组件通过 Tailwind 文本色类控制。
   - 理由：Agent fallback 需要适应不同背景（如选中态、hover 态），中性色更灵活；品牌色模式留给未来非 Agent 场景复用。

5. **SVG 阴影处理**：
   - 保留 `feDropShadow` 滤镜，但需在小尺寸（如 `SessionItem` 的 14px）下视觉验证。
   - 若阴影导致小尺寸发糊，实现时可将 `neutral` 模式下的阴影移除或简化。

## Risks / Trade-offs

- **小尺寸可读性**：原 SVG 阴影在极小尺寸下可能显得脏或糊。Mitigation：实现后手动检查 14px、18px、36px 三种尺寸，必要时在 `neutral` 模式下禁用阴影。
- **颜色模式切换增加组件复杂度**：Mitigation：仅支持两个枚举值，逻辑简单，默认 `default` 不影响现有场景。
- **规范变更需要同步测试或截图验收**：Mitigation：tasks.md 中增加视觉验证任务。
