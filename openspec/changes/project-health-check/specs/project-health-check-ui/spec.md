## ADDED Requirements

### Requirement: AppHeader 中央区域显示健康度 icon

系统 SHALL 在 AppHeader 中央区域的 ProjectSelector div 右侧渲染健康度 icon。icon SHALL 为圆形边框样式，尺寸与现有图标按钮一致（22px × 22px，内部图标 16px × 16px）。icon 颜色 SHALL 根据当前项目的 `healthScore` 映射：`undefined` 或 0 → 灰色（`text-muted`），1–59 → 橙色（`text-orange-500`），60–100 → 绿色（`text-green-500`）。无活跃项目时 SHALL NOT 渲染健康度 icon。

#### Scenario: 无 healthScore 时显示灰色 icon

- **WHEN** 当前项目的 `healthScore` 为 `undefined` 或 0
- **THEN** 健康度 icon 以灰色（`text-muted`）渲染

#### Scenario: healthScore 低于 60 时显示橙色 icon

- **WHEN** 当前项目的 `healthScore` 在 1–59 之间
- **THEN** 健康度 icon 以橙色（`text-orange-500`）渲染

#### Scenario: healthScore 达到 60 时显示绿色 icon

- **WHEN** 当前项目的 `healthScore` 在 60–100 之间
- **THEN** 健康度 icon 以绿色（`text-green-500`）渲染

#### Scenario: 无活跃项目时不渲染健康度 icon

- **WHEN** `projectStore.currentProject` 为 null
- **THEN** AppHeader 中央区域不渲染健康度 icon

### Requirement: 点击健康度 icon 弹出 Popover

系统 SHALL 在用户点击健康度 icon 时弹出 UPopover，内容包含：说明文字（"当前项目尚未进行健康检查"或"上次健康检查得分：{score}"）、"开始健康检查"确认按钮。用户点击确认按钮后，Popover SHALL 关闭，系统 SHALL 发起健康检查 session。

#### Scenario: 点击 icon 弹出 Popover

- **WHEN** 用户点击健康度 icon
- **THEN** UPopover 打开
- **AND** 显示当前健康度状态说明
- **AND** 显示"开始健康检查"按钮

#### Scenario: 点击确认后关闭 Popover 并发起 session

- **WHEN** 用户点击"开始健康检查"按钮
- **THEN** Popover 关闭
- **AND** 系统发起健康检查 chat session
