# chat-session-config-controls Specification

## Purpose

TBD - created by archiving change consolidate-config-options-menu. Update Purpose after archive.

## Requirements

### Requirement: ChatPrompt 以单一入口展示可见 session 配置

系统 SHALL 在 ChatPrompt footer 中以至多一个配置触发按钮展示当前 Agent 的非 mode session config options，不得按 option 数量横向增加 footer 控件。系统 SHALL 在过滤后没有可见 option 时隐藏该触发按钮。

#### Scenario: Agent 提供多个可见配置

- **WHEN** active session 或 ready draft probe 提供两个或以上 `category != mode` 的 config options
- **THEN** ChatPrompt footer SHALL 只显示一个配置触发按钮
- **AND** 所有可见 option SHALL 通过该按钮打开的同一菜单访问

#### Scenario: Agent 只提供 mode 配置

- **WHEN** config options 为空或过滤 `category=mode` 后为空
- **THEN** ChatPrompt footer SHALL 不显示配置触发按钮

### Requirement: 配置触发按钮提供 model 与 thought level 摘要

系统 SHALL 按 Agent 提供顺序分别选择第一个 `type=select && category=model` 和第一个 `type=select && category=thought_level` option，并使用其当前 value name 构造触发摘要。两者存在时 SHALL 以 `·` 连接；只存在一个时 SHALL 只显示该值；两者都不存在时 SHALL 显示 `Config`。当前 value 无法匹配 value item 时 SHALL 回退显示 raw `currentValue`。

#### Scenario: model 与 thought level 都存在

- **WHEN** 当前配置包含 model=`GPT-5.5` 与 thought level=`High`
- **THEN** 触发按钮 SHALL 显示 `GPT-5.5 · High`

#### Scenario: 只有 model category

- **WHEN** 当前配置包含 model option 但不包含 thought level option
- **THEN** 触发按钮 SHALL 只显示当前 model value name

#### Scenario: 两个摘要 category 都缺失

- **WHEN** 可见配置不包含 select 类型的 model 或 thought level category
- **THEN** 触发按钮 SHALL 显示 `Config`

#### Scenario: 同一 category 出现多次

- **WHEN** Agent 提供多个 model 或多个 thought level option
- **THEN** 摘要 SHALL 使用 Agent 数组中第一个匹配 option
- **AND** 其他 option SHALL 继续保留在主菜单中

### Requirement: 菜单按 option 类型提供原生交互

系统 SHALL 保持 Agent 提供的非 mode config option 原始顺序。每个 select option SHALL 作为一级菜单项并以子菜单展示 flat 或 grouped values；每个 boolean option SHALL 作为一级 checkbox 展示并直接切换。系统 SHALL 保留 option/value name、description、group 顺序、当前选中状态和单 option pending 禁用状态。

#### Scenario: 打开 flat select option

- **WHEN** 用户打开一个 flat select option 的子菜单
- **THEN** 子菜单 SHALL 按 Agent value 顺序展示全部 value name
- **AND** 当前 value SHALL 显示选中状态

#### Scenario: 打开 grouped select option

- **WHEN** 用户打开一个 grouped select option 的子菜单
- **THEN** 子菜单 SHALL 保留 group label、group 顺序和各组内 value 顺序

#### Scenario: 切换 boolean option

- **WHEN** 用户操作一级 boolean checkbox
- **THEN** 系统 SHALL 以 boolean value 调用既有 draft 或 established session 配置修改流程
- **AND** 系统 SHALL NOT 为 true/false 创建额外子菜单

#### Scenario: 单个配置正在提交

- **WHEN** 某个 option ID 存在于 pending config IDs
- **THEN** 系统 SHALL 只禁用并标记该 option
- **AND** 用户 SHALL 仍可查看或修改其他非 pending option

### Requirement: 菜单始终消费 Agent 完整配置快照

系统 SHALL 从 active session 或 ready draft probe 的当前完整 `configOptions` snapshot 派生摘要和菜单，不得在组件中维护独立配置副本。配置修改成功或 Agent 主动发送完整 snapshot 后，系统 SHALL 同步替换摘要、子菜单、boolean 状态以及新增或移除的 options。

#### Scenario: model 变化重塑 thought level

- **WHEN** 用户修改 model 且 Agent 完整响应改变 thought level 的 current value 或 options
- **THEN** 菜单 SHALL 使用响应后的 thought level schema 重建子菜单
- **AND** trigger 摘要 SHALL 显示响应后的 value name

#### Scenario: Agent 主动改变配置集合

- **WHEN** Agent 发送 config option update 新增或移除可见 option
- **THEN** 同一配置菜单 SHALL 反映新的完整集合
- **AND** ChatPromptPanel SHALL 不需要感知集合变化

### Requirement: mode 隐藏规则封装在 ConfigOptions 内部

系统 SHALL 在生成触发摘要和菜单项之前过滤所有 `category=mode` options。ChatPromptPanel SHALL 只挂载 ConfigOptions 组件，不得承担 mode 过滤或菜单结构判断。

#### Scenario: mode 与其他配置并存

- **WHEN** Agent 同时提供 mode、model 和自定义配置
- **THEN** 配置菜单 SHALL 展示 model 与自定义配置
- **AND** 配置菜单及触发摘要 SHALL 不展示 mode
