## MODIFIED Requirements

### Requirement: 卸载入口可见性

设置页 SHALL 仅在 `AcpAgentStatus.installed === true` 时提供卸载操作项。卸载操作项可呈现为 kebab（`...`）菜单中的菜单项，不要求是常驻并排按钮。卸载操作项 SHALL 在另一个 agent 处于安装中或卸载中状态时禁用，禁用时通过 tooltip 提示"其他 Agent 正在处理中"。

#### Scenario: agent 未安装

- **WHEN** `AcpAgentStatus.installed === false`
- **THEN** 不提供卸载操作项（不渲染卸载菜单项，且当无其它次操作时不渲染 kebab 菜单入口）

#### Scenario: agent 已安装且无并发操作

- **WHEN** `AcpAgentStatus.installed === true`，且当前没有任何 agent 处于 `installing` / `downloading` / `uninstalling` 状态
- **THEN** 提供可点击的卸载操作项（位于 kebab 菜单内）

#### Scenario: agent 已安装但其他 agent 处于安装中或卸载中

- **WHEN** `AcpAgentStatus.installed === true`，且存在另一个 agent 的 progress 状态为 `installing` / `downloading` / `uninstalling`
- **THEN** 卸载操作项渲染但处于禁用态，hover 时提示"其他 Agent 正在处理中"
