# project-health-check-ui 规范

## Purpose

定义 AppHeader 中央健康度 icon 的颜色、Popover 交互、确认后发起健康检查 session，以及进入项目/点击时的 `healthScore` 刷新行为。

## Requirements

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

### Requirement: 健康度 icon 在进入项目时读取并在点击时主动刷新

icon 颜色 SHALL 基于当前项目的 `healthScore` 渲染。读取时机为：

1. 进入或切换项目后，系统 SHALL 从 `projectStore.currentProject.healthScore` 同步读取并渲染 icon 颜色
2. 用户点击 icon 时，系统 SHALL 同步打开 UPopover（基于点击时刻已知的 `healthScore` 渲染颜色与文案，不等待网络请求），并并发调用 `project:getById` 重新获取最新 `ProjectInfo`
3. `project:getById` 返回成功时，系统 SHALL 将最新 `healthScore` 写回 `projectStore.currentProject`，icon 颜色与 Popover 内文案 SHALL 随响应式更新；SHALL NOT 因刷新触发 session 重载或其他副作用
4. `project:getById` 返回失败时，系统 SHALL 保留原 `healthScore`，UPopover SHALL 保持打开，SHALL NOT 弹出错误提示，SHALL NOT 关闭或回退 UI 状态

#### Scenario: 进入项目后 icon 颜色基于 healthScore 渲染

- **WHEN** 用户切换或打开一个项目，且 `ProjectInfo` 已就绪
- **THEN** AppHeader 健康度 icon 颜色基于 `currentProject.healthScore` 按颜色映射规则渲染

#### Scenario: 点击 icon 同步打开 Popover 并后台刷新

- **WHEN** 用户点击健康度 icon
- **THEN** UPopover 同步打开，文案与颜色基于点击时刻的 `currentProject.healthScore` 渲染
- **AND** 系统并发调用 `project:getById` 获取最新 `ProjectInfo`

#### Scenario: 后台刷新成功后颜色与文案同步更新

- **WHEN** `project:getById` 返回成功且 `healthScore` 与原值不同
- **THEN** `projectStore.currentProject.healthScore` 更新为最新值
- **AND** icon 颜色按新 `healthScore` 重新渲染
- **AND** UPopover 内的得分文案同步更新

#### Scenario: 后台刷新失败保留旧值

- **WHEN** `project:getById` 返回失败
- **THEN** `projectStore.currentProject.healthScore` 保持原值
- **AND** icon 颜色不变
- **AND** UPopover 保持打开
- **AND** 系统不弹出错误提示
