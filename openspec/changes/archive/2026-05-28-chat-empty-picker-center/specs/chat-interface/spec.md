## MODIFIED Requirements

### Requirement: ChatEmptyAgentPicker 展示已安装 Agent 方块卡片

`ChatEmptyAgentPicker` SHALL 在页面中央展示标题 "Pick an Agent to Start"，以及一组横向居中的方块卡片：N 个已安装 Agent 的 `InstalledAgentTile` + 1 个 `MoreAgentsTile`（`variant="more"`），其中 N = `Math.min(installedAgentIds.length, 4)`。卡片整体 SHALL 横向居中，且 SHALL NOT 因列数变化而被拉伸——单卡视觉宽度在 N=1~4 之间保持一致。

当无已安装 Agent 时（N=0），`ChatEmptyAgentPicker` SHALL 仅展示单个 `MoreAgentsTile`（`variant="promo"`），文案为 "N+ Agents Available"（N 取 `registry.agents.length`）和"点击安装你的第一个 Agent"；该 promo 卡 SHALL 横向居中并 SHALL NOT 横跨外层容器全宽。

布局约束：

- 有已安装时，卡片容器 SHALL 使用 `flex justify-center items-center gap-3`，卡片宽高由子组件自身（`InstalledAgentTile` 的 `aspect-square`、`MoreAgentsTile variant="more"` 的 `aspect-square`）决定，父容器 SHALL NOT 通过列宽或固定尺寸强制拉伸子卡片。
- 卡片之间间距 SHALL 沿用现有 `gap-3`。
- promo 卡的可视宽度 SHALL 收敛到一个固定上限（如 `max-w-sm`），不依赖 grid `col-span` 撑满。

#### Scenario: 已安装 4 个时展示 4 + More 共 5 张并居中

- **WHEN** `installedAgentIds.length >= 4`
- **THEN** 展示 4 个 `InstalledAgentTile` 与 1 个 `MoreAgentsTile variant="more"`
- **AND** 5 张卡片整组横向居中
- **AND** 单卡宽度与基线保持一致

#### Scenario: 已安装少于 4 个时按 N+1 居中

- **WHEN** `installedAgentIds.length` 为 1 / 2 / 3
- **THEN** 展示 N 个 `InstalledAgentTile` 与 1 个 `MoreAgentsTile variant="more"`，共 N+1 张卡片
- **AND** 这 N+1 张卡片整组横向居中
- **AND** 单卡宽度与 N=4 时一致，不因列数减少被拉伸

#### Scenario: 无已安装 Agent 时展示 promo 卡且居中

- **WHEN** `installedAgentIds.length === 0`
- **THEN** 仅展示单个 `MoreAgentsTile variant="promo"`，显示 registry 总数和安装引导文案
- **AND** 该 promo 卡横向居中
- **AND** 该 promo 卡的可视宽度受限，不横跨外层容器全宽
