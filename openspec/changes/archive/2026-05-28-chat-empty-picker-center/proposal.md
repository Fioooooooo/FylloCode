## Why

Chat 空态的 `ChatEmptyAgentPicker` 当前固定使用 5 列网格（已安装态）或 2 列网格（无已安装态）撑满 `max-w-2xl`。当用户已安装 Agent 数量少于 4 时，卡片被强行拉伸到等分宽度，整组 tile 在视觉上稀疏、不居中；无已安装时 `MoreAgentsTile variant="promo"` 横跨整个 `max-w-2xl`，宽度过大与单个 promo 卡的视觉重量不匹配。需要按"卡片自身尺寸不变 + 整组横向居中"的方向改造布局，让 N=0~4 各档下视觉密度一致。

## What Changes

- 修改 `ChatEmptyAgentPicker` 的有已安装分支：把固定 5 列网格改为 **N+1 列、卡片宽度固定（基线为原 5 列布局下的等分宽度）、整组横向居中** 的布局；N 取 `installedAgentIds` 前 4 项数量；卡片自身尺寸保持不变。
- 修改 `ChatEmptyAgentPicker` 的无已安装分支：`MoreAgentsTile variant="promo"` 不再横跨整个 `max-w-2xl`，改为 **限制可视宽度后横向居中**（不依赖 grid `col-span`）。
- 同步更新 `chat-interface` spec 中「ChatEmptyAgentPicker 展示已安装 Agent 方块卡片」requirement：移除"5 列网格（grid-cols-5）"的硬约束，重新表述为"N+1 卡片整组横向居中"与"promo 卡片受限宽度居中"。
- 不改动 `InstalledAgentTile.vue` 与 `MoreAgentsTile.vue` 自身的样式与 props 契约。
- 不改动「InstalledAgentTile 即点即生效」、「MoreAgentsTile 打开 AgentPickerModal」、「AgentPickerModal 支持搜索、安装、选择」三个 requirement。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `chat-interface`：「ChatEmptyAgentPicker 展示已安装 Agent 方块卡片」requirement 的布局描述从"5 列网格 + 4 个 InstalledAgentTile + 1 个 MoreAgentsTile"调整为"N+1 卡片整组横向居中（N ∈ [1,4]）"和"promo 卡片受限宽度居中"。

## Impact

- 代码：`frontend/src/components/chat/empty/ChatEmptyAgentPicker.vue` 模板布局调整；`InstalledAgentTile.vue` / `MoreAgentsTile.vue` 不变。
- 测试：`frontend/src/__tests__/components/more-agents-tile.spec.ts` 不需要调整（只测 tile 自身）；若有 ChatEmptyAgentPicker 自身的快照/布局测试，需要复核（当前仓库未发现）。
- Spec：更新 `openspec/specs/chat-interface/spec.md` 中对应 requirement 的描述与 scenario。
- 不影响 IPC、store、agent 选择行为、AgentPickerModal 流程。
- 视觉影响仅限 Chat 空态页面，N=4 时与原 5 列布局视觉一致。
