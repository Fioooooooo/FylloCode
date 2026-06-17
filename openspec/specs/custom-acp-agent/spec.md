# custom-acp-agent Specification

## Purpose

TBD - created by archiving change support-custom-acp-agents. Update Purpose after archive.

## Requirements

### Requirement: 自定义 Agent 配置文件

系统 SHALL 在 `data/acp/custom-agents.json` 中持久化用户自定义 Agent 配置。文件 schema 与 Zed 的 `agent_servers` 一致，但不含 `type` 字段。顶层固定为 `agent_servers`，其值为一个对象，key 为显示名，value 包含 `command`、`args`、`env`。

#### Scenario: 合法配置文件

- **WHEN** `custom-agents.json` 内容为
  ```json
  {
    "agent_servers": {
      "Kimi Code CLI": {
        "command": "~/.local/bin/kimi",
        "args": ["acp"],
        "env": {}
      }
    }
  }
  ```
- **THEN** 系统 SHALL 解析出一个显示名为 "Kimi Code CLI"、command 为 "~/.local/bin/kimi"、args 为 `["acp"]`、env 为 `{}` 的自定义 Agent

#### Scenario: 文件缺失时兜底

- **WHEN** `custom-agents.json` 不存在
- **THEN** 系统 SHALL 视其为 `{ "agent_servers": {} }`，不抛错

### Requirement: 自定义 Agent 标识

每个自定义 Agent SHALL 拥有一个稳定的内部 id，格式为 `custom-${slug(basename(command))}-${shortHash(command + args)}`。id 在配置加载时根据解析后的绝对路径与 args 计算得出。

#### Scenario: 相同 command/args 生成相同 id

- **WHEN** 两个自定义 Agent 配置的实际 command（经 `~` 展开和 PATH 解析后）与 args 完全相同
- **THEN** 系统 SHALL 为它们生成相同的 id

#### Scenario: 改名不改 id

- **WHEN** 用户仅修改 `agent_servers` 中的显示名 key，而不改 command 与 args
- **THEN** 系统 SHALL 保持该 Agent 的 id 不变

#### Scenario: 改 command 改 id

- **WHEN** 用户修改 command 或 args
- **THEN** 系统 SHALL 生成新的 id，并视其为新 Agent

### Requirement: command 路径解析

系统 SHALL 在加载自定义 Agent 配置时，对 `command` 做 `~` 展开与 PATH 环境变量查找，生成用于 id 计算与进程启动的绝对路径。

#### Scenario: 相对路径通过 PATH 解析

- **WHEN** command 为 `kimi`，且 `kimi` 存在于 PATH 中
- **THEN** 系统 SHALL 解析出其绝对路径

#### Scenario: 绝对路径保持原样

- **WHEN** command 已经是绝对路径
- **THEN** 系统 SHALL 直接使用该路径

### Requirement: 自定义 Agent 与 Registry Agent 并列

自定义 Agent SHALL 与 Registry Agent 在运行时发现、状态列表、选择器、工作流中处于同等级。自定义 Agent 的 id 以 `custom-` 前缀生成，确保不会与 Registry Agent id 冲突。

#### Scenario: 选择器中同时存在两类 Agent

- **WHEN** 系统中同时存在 Registry Agent `claude-code` 与 Custom Agent `custom-kimi-acp-7f3a9e2d`
- **THEN** 两者 SHALL 在选择器中并列展示，互不覆盖

### Requirement: 自定义 Agent 存在即可用

自定义 Agent 不需要 install/uninstall/update 流程。只要其配置存在且 command 可解析，系统 SHALL 视其为可用；command 不可解析时 SHALL 显示"命令未找到"状态，但不阻止保存配置。

#### Scenario: command 存在

- **WHEN** 自定义 Agent 的 command 可解析且文件存在
- **THEN** 系统返回 `installed: true`

#### Scenario: command 不存在

- **WHEN** 自定义 Agent 的 command 无法解析或文件不存在
- **THEN** 系统返回 `installed: false`，并在 UI 中展示"命令未找到"

### Requirement: 自定义 Agent 启动时环境变量注入

启动自定义 Agent 时，系统 SHALL 将 `process.env` 与用户自定义 `env` 合并，合并后 `env` 中的同名 key SHALL 覆盖系统环境变量。

#### Scenario: 用户自定义 env 覆盖系统 env

- **WHEN** 自定义 Agent 的 `env` 为 `{ "FOO": "bar" }`，且系统 env 中 `FOO` 为 `"baz"`
- **THEN** 启动该 Agent 时 `FOO` 的值 SHALL 为 `"bar"`

### Requirement: 设置页管理自定义 Agent

系统 SHALL 在 `SettingsAgents` 页面提供"自定义" tab，tab 内使用 `stream-monaco` 编辑 `custom-agents.json`，并提供字段说明与保存按钮。保存时系统 SHALL 校验 JSON 格式，写入文件后刷新 Agent 列表。

#### Scenario: 保存合法配置

- **WHEN** 用户在 JSON 编辑器中输入合法配置并点击保存
- **THEN** 系统 SHALL 写入 `custom-agents.json`，并触发 Agent 列表刷新

#### Scenario: 保存非法 JSON

- **WHEN** 用户在 JSON 编辑器中输入非法 JSON 并点击保存
- **THEN** 系统 SHALL 不写入文件，并提示 JSON 格式错误

### Requirement: Chat 选择器支持自定义 Agent

系统 SHALL 在 `ChatEmptyAgentPicker` 的已安装 Agent 展示与 `AgentPickerModal` 中支持自定义 Agent。`AgentPickerModal` SHALL 顶部新增 Registry/Custom tab，Custom tab 以卡片网格展示自定义 Agent。

#### Scenario: Empty 状态展示自定义 Agent

- **WHEN** 用户已配置自定义 Agent 且 command 可解析
- **THEN** Chat empty 状态的 4 个已安装 Agent slot SHALL 可能包含该自定义 Agent

#### Scenario: More 弹窗切换 Custom tab

- **WHEN** 用户在 Chat empty 点击 more 打开弹窗，并切换到 Custom tab
- **THEN** 系统 SHALL 以卡片形式展示所有自定义 Agent

### Requirement: 工作流支持自定义 Agent

系统 SHALL 允许 workflow stage 选择自定义 Agent。YAML 中保存自定义 Agent 的 id，执行时通过 Agent Catalog 解析并启动。

#### Scenario: Stage 选择自定义 Agent

- **WHEN** 用户在 workflow stage 的 agent dropdown 中选择一个自定义 Agent
- **THEN** 该 stage 的 YAML 中 `agent` 字段 SHALL 保存为 `custom-xxx` id

### Requirement: 默认图标

自定义 Agent 无图标时，系统 SHALL 使用 FylloCode Logo（通过 `CustomAgentIcon.vue` 组件渲染）作为默认图标。

#### Scenario: SessionItem 显示默认图标

- **WHEN** 渲染一个自定义 Agent 的 session 历史项，且该 Agent 无图标
- **THEN** `SessionItem` SHALL 展示 FylloCode Logo（`color="neutral"`）

#### Scenario: AgentPickerCard 显示默认图标

- **WHEN** 在 Agent 选择器中展示一个自定义 Agent，且该 Agent 无图标
- **THEN** `AgentPickerCard` SHALL 展示 FylloCode Logo（`color="neutral"`）

#### Scenario: ChatEmptyAgentPicker 显示默认图标

- **WHEN** 在 Chat 空态展示已安装的自定义 Agent，且该 Agent 无图标
- **THEN** `ChatEmptyAgentPicker` SHALL 展示 FylloCode Logo（`color="neutral"`）

#### Scenario: AgentPickerModal 空态显示默认图标

- **WHEN** `AgentPickerModal` 切换到 Custom tab 且没有任何自定义 Agent
- **THEN** `AgentPickerModal` SHALL 展示 FylloCode Logo（`color="neutral"`）作为空态图标
