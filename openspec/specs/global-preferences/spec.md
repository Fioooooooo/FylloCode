# global-preferences 规范

## Purpose

定义全局偏好设置的数据分组、主题/行为/数据选项、即时保存机制及清除历史数据确认流程。

## Requirements

### Requirement: Appearance 分组配置

Preferences tab SHALL 包含 Appearance 分组，含以下配置项：

1. 主题模式：三选一单选组（Light / Dark / System），选择 System 时跟随操作系统。SHALL 通过 `useColorMode()` 与顶栏明暗切换按钮双向联动。
2. 界面语言：下拉选择，选项至少包含 English 和 中文。

#### Scenario: 切换主题模式

- **WHEN** 用户在 Preferences 中选择 "Dark"
- **THEN** 应用立即切换为深色主题，顶栏明暗切换按钮状态同步更新

#### Scenario: 顶栏切换联动

- **WHEN** 用户点击顶栏明暗切换按钮
- **THEN** Preferences 中主题模式单选组的选中项同步变化

#### Scenario: System 主题跟随系统

- **WHEN** 用户选择 "System" 且操作系统为深色模式
- **THEN** 应用显示深色主题

### Requirement: Behavior 分组配置

Preferences tab SHALL 包含 Behavior 分组，含以下配置项：

1. 默认自动模式：Auto / Manual 单选，新建会话时的默认值。
2. 通知方式：多选，选项包括系统通知（`system`）、声音提示（`sound`）、仅应用内标记（`in-app`）。
3. 会话自动保存：开关（UToggle），关闭后会话关闭时不保存历史。

#### Scenario: 修改默认自动模式

- **WHEN** 用户将默认自动模式从 Auto 改为 Manual
- **THEN** store `preferences.defaultAgentMode` 更新为 `"manual"`，下次新建会话时默认使用 Manual 模式

#### Scenario: 多选通知方式

- **WHEN** 用户勾选 "系统通知" 和 "声音提示"
- **THEN** store `preferences.notificationMethods` 更新为 `["system", "sound"]`

#### Scenario: 关闭会话自动保存

- **WHEN** 用户关闭会话自动保存开关
- **THEN** store `preferences.autoSaveSession` 更新为 `false`

### Requirement: Data 分组配置

Preferences tab SHALL 包含 Data 分组，含以下配置项：

1. Token 用量统计周期：单选，选项为 Daily / Weekly / Monthly。
2. 预算警告阈值：数字输入框 + 单位选择（tokens / USD）。
3. 清除所有历史数据：危险操作按钮，使用 `color="error"` 语义色（禁止硬编码颜色），点击后弹出 UModal 二次确认对话框。

#### Scenario: 设置预算警告阈值

- **WHEN** 用户输入 1000 并选择单位 "tokens"
- **THEN** store `preferences.budgetAlert` 更新为 `{ value: 1000, unit: "tokens" }`

#### Scenario: 清除历史数据二次确认

- **WHEN** 用户点击 "清除所有历史数据" 按钮
- **THEN** 弹出确认对话框，包含警告说明和确认/取消按钮

#### Scenario: 确认清除历史数据

- **WHEN** 用户在确认对话框中点击确认
- **THEN** store action `clearAllHistory()` 被调用，对话框关闭

#### Scenario: 取消清除历史数据

- **WHEN** 用户在确认对话框中点击取消
- **THEN** 对话框关闭，数据不变

### Requirement: 即时保存机制

所有偏好配置项 SHALL 在用户修改后即时生效并自动保存，无需全局保存按钮。组件层通过调用 store action `updatePreference(key, value)` 持久化变更。

#### Scenario: 配置项修改即时保存

- **WHEN** 用户修改任意偏好配置项
- **THEN** 变更立即反映在 UI 上，store state 同步更新，无需额外操作
