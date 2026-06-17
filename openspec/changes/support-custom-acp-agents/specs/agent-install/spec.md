# agent-install 规范（变更）

## Purpose

管理 CLI agent 的安装流程，支持 npx、uvx、binary 三种分发类型，并维护安装记录。本次变更扩展状态检测范围，使其同时覆盖自定义 Agent。

## MODIFIED Requirements

### Requirement: Agent 安装状态检测

主进程 SHALL 通过 `acp:detectStatus` 检测系统中每个 **Catalog Agent** 的安装状态，返回 `AcpAgentStatus[]`，每项包含 `id`、`installed`、`detectedVersion`（可选）、`managedBy`（`"fyllocode" | "user" | null`）。Catalog Agent 包含 Registry Agent 与 Custom Agent 两类。

#### Scenario: 检测到自定义 Agent 已安装

- **WHEN** 调用 `detectStatus`，且某 custom agent 的 command 经 `~` 展开和 PATH 解析后指向存在的可执行文件
- **THEN** 返回 `installed: true, managedBy: null, detectedVersion: undefined`

#### Scenario: 检测到自定义 Agent 未安装

- **WHEN** 调用 `detectStatus`，且某 custom agent 的 command 无法解析或指向文件不存在
- **THEN** 返回 `installed: false, managedBy: null`

#### Scenario: Registry Agent 检测行为保持不变

- **WHEN** 调用 `detectStatus` 检测 Registry Agent
- **THEN** 返回结果与变更前一致，包括 `managedBy` 与 `detectedVersion` 语义

#### Scenario: 检测到已安装（FylloCode 管理）

- **WHEN** 调用 `detectStatus`，且 `installed.json` 中存在该 agent 记录，且对应命令/文件在系统中可找到
- **THEN** 返回 `installed: true, managedBy: "fyllocode", detectedVersion: <版本号>`

#### Scenario: 检测到已安装（用户自行安装）

- **WHEN** 调用 `detectStatus`，且系统中可找到该 agent 命令，但 `installed.json` 中无记录
- **THEN** 返回 `installed: true, managedBy: "user", detectedVersion: <版本号>`，并在 `installed.json` 中写入 `managedBy: "user"` 记录

#### Scenario: 未安装

- **WHEN** 调用 `detectStatus`，且系统中找不到该 agent 命令/文件
- **THEN** 返回 `installed: false, managedBy: null`

### Requirement: 卸载入口可见性

设置页 SHALL 仅在 `AcpAgentStatus.installed === true` 时提供卸载操作项。卸载操作项可呈现为 kebab（`...`）菜单中的菜单项，不要求是常驻并排按钮。卸载操作项 SHALL 在另一个 agent 处于安装中或卸载中状态时禁用，禁用时通过 tooltip 提示"其他 Agent 正在处理中"。**Custom Agent 不展示卸载操作项，因为它不存在安装流程。**

#### Scenario: 自定义 Agent 卡片不展示卸载入口

- **WHEN** 渲染一个 custom agent 卡片
- **THEN** SHALL 不渲染 kebab 菜单及卸载操作项

#### Scenario: agent 未安装

- **WHEN** `AcpAgentStatus.installed === false`
- **THEN** 不提供卸载操作项（不渲染卸载菜单项，且当无其它次操作时不渲染 kebab 菜单入口）

#### Scenario: agent 已安装且无并发操作

- **WHEN** `AcpAgentStatus.installed === true`，且当前没有任何 agent 处于 `installing` / `downloading` / `uninstalling` 状态
- **THEN** 提供可点击的卸载操作项（位于 kebab 菜单内）

#### Scenario: agent 已安装但其他 agent 处于安装中或卸载中

- **WHEN** `AcpAgentStatus.installed === true`，且存在另一个 agent 的 progress 状态为 `installing` / `downloading` / `uninstalling`
- **THEN** 卸载操作项渲染但处于禁用态，hover 时提示"其他 Agent 正在处理中"

### Requirement: 卸载 IPC 契约

`acp:uninstall` 通道 SHALL 接受 `agentId: string`（非空）作为输入参数，校验通过 `uninstallAgentInputSchema = z.string().min(1)`。**Custom Agent id 以 `custom-` 前缀开头，调用 `acp:uninstall` 时 SHALL 返回错误 `{ code: "AGENT_NOT_FOUND" }`，因为自定义 Agent 不存在安装记录。**

#### Scenario: 输入参数为空

- **WHEN** 调用 `acp:uninstall` 时传入空字符串或 `undefined`
- **THEN** schema 校验失败，返回错误，不进入业务逻辑

#### Scenario: agent 是自定义 Agent

- **WHEN** 调用 `acp:uninstall` 传入以 `custom-` 开头的 agentId
- **THEN** 返回错误 `{ code: "AGENT_NOT_FOUND", message: "自定义 Agent 不支持卸载操作" }`

#### Scenario: agent 未在 registry 中

- **WHEN** 调用 `acp:uninstall` 传入的 agentId 在 registry 中找不到
- **THEN** 返回错误 `{ code: "AGENT_NOT_FOUND", message: "未知 Agent: <agentId>" }`

#### Scenario: agent 在 registry 但 installed.json 中无记录

- **WHEN** 调用 `acp:uninstall` 时该 agent 的 `installed.json` 条目不存在
- **THEN** 返回错误 `{ code: "AGENT_NOT_FOUND", message: "Agent <agentId> is not installed" }`
