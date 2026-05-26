## ADDED Requirements

### Requirement: ChatPromptPanel 在 footer 渲染 ConfigOptionsBar

系统 SHALL 在 `frontend/src/components/chat/prompt/ChatPromptPanel.vue` 的 `UChatPrompt#footer` slot 左侧动作区中，紧随 `ChatAgentSelect` 之后渲染 `ConfigOptionsBar` 组件，用于呈现 ACP agent 暴露的 session 级配置选项（mode / model / thought_level 等）。

`ConfigOptionsBar` 的渲染条件 SHALL 严格按照下述真值表决定：

| 状态                                                                           | 渲染   |
| ------------------------------------------------------------------------------ | ------ |
| `activeSession === null`（草稿态）                                             | 不渲染 |
| `activeSession.configOptions === undefined` 或 `null`（agent 尚未回传）        | 不渲染 |
| `activeSession.configOptions.length === 0`（agent 显式声明无可配置项或不支持） | 不渲染 |
| `activeSession.configOptions.length > 0`                                       | 渲染   |

`ConfigOptionsBar` 出现/消失时 SHALL 使用 150ms 的 ease-out 淡入位移过渡（opacity + translate-y-1），不使用 skeleton/placeholder。

#### Scenario: 草稿态隐藏 ConfigOptionsBar

- **WHEN** 用户处于草稿态（`activeSession === null`）
- **THEN** `ConfigOptionsBar` 完全不渲染（v-if）
- **AND** footer 左侧只有 `+`、`/` 与 `ChatAgentSelect`

#### Scenario: 已建立 session 但 agent 未回传 configOptions

- **WHEN** session 已建立（`activeSession.acpSessionId` 已存在），但 `activeSession.configOptions === undefined`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: agent 显式声明无 configOptions

- **WHEN** chat store 收到 `config_options_update` chunk，`options` 为空数组并替换 `activeSession.configOptions`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: configOptions 非空时渲染

- **WHEN** `activeSession.configOptions` 长度为 3，分别为 mode、model、effort
- **THEN** `ConfigOptionsBar` 渲染 3 个选择器
- **AND** 视觉位置位于 `ChatAgentSelect` 之后、ContextUsageRing 之前

### Requirement: ConfigOptionsBar 排序与未知 category fallback

`ConfigOptionsBar` SHALL 按下述固定优先级对 `configOptions` 进行排序后渲染：

1. `category === "mode"` 的项排第 1
2. `category === "model"` 的项排第 2
3. `category === "thought_level"` 的项排第 3
4. 其余项（含 `null` / `undefined` / 自定义字符串如 `_custom`）按 agent 返回的原顺序追加在末尾

每个选项的图标 SHALL 按下述规则映射：

- `category === "mode"` → `i-lucide-shield-check`
- `category === "model"` → `i-lucide-cpu`
- `category === "thought_level"` → `i-lucide-brain`
- 其它（含未知值） → `i-lucide-sliders`

排序与图标映射均 SHALL 不影响选项的功能行为；客户端对未知 category 的处理与已知 category 完全相同（按 `type` 渲染 dropdown 或 switch）。

#### Scenario: 三个已知 category 按固定顺序排列

- **WHEN** agent 返回的 `configOptions` 顺序为 `[thought_level, model, mode]`
- **THEN** UI 渲染顺序 SHALL 为 `[mode, model, thought_level]`

#### Scenario: 未知 category 走 fallback 图标

- **WHEN** 某项 `category === "_custom"`
- **THEN** 该项使用 `i-lucide-sliders` 图标
- **AND** 仍按 `type` 渲染 dropdown 或 switch

#### Scenario: 缺失 category 视为未知

- **WHEN** 某项的 `category` 为 `null` 或 `undefined`
- **THEN** 该项追加在三个已知 category 之后
- **AND** 使用 fallback 图标

### Requirement: ConfigOptionItem 按 type 渲染交互组件

`ConfigOptionItem` SHALL 按 `type` 字段分派渲染：

- `type === "select"` SHALL 渲染 `UDropdownMenu`，触发器为 ghost-variant、size sm 的 `UButton`，按钮内显示 `name + " "` 与该 currentValue 对应选项的 `name`（找不到时回落到 `currentValue` 字符串本身），按钮 hover SHALL 显示 `description`（若存在）。
- `type === "boolean"` SHALL 渲染 `USwitch` 与 label。
- `select.options` 为 `Array<AcpSessionConfigOptionGroup>` 形态时，SHALL 渲染分组的 `UDropdownMenu`（每个 group 一个 group label + 其下的项）；为平铺 `Array<AcpSessionConfigOptionValueItem>` 形态时渲染单层菜单。

用户点击 select 项或切换 switch 时，SHALL 调用 chat store 的 `setConfigOption` action（不经组件直接调 IPC）。

#### Scenario: select 渲染下拉

- **WHEN** 某 configOption 的 `type === "select"`
- **THEN** 渲染 `UDropdownMenu`
- **AND** 触发器按钮显示 `name + currentValueLabel`

#### Scenario: boolean 渲染开关

- **WHEN** 某 configOption 的 `type === "boolean"`
- **THEN** 渲染 `USwitch` 与 label

#### Scenario: 分组 options 渲染嵌套菜单

- **WHEN** select 的 `options` 类型为 `AcpSessionConfigOptionGroup[]`
- **THEN** 菜单按 group 分块渲染
- **AND** 每个 group 显示自身 `name`，其下列出该 group 的所有项

### Requirement: chat store 处理 config_options_update chunk

`frontend/src/stores/chat.ts` 的 `streamSessionMessage.onChunk` SHALL 新增 `case "config_options_update"`，调用 `useSessionStore().setSessionConfigOptions(activeSession.id, data.options)` 把全集替换到 session 内存态字段 `Session.configOptions`。

`useSessionStore` SHALL 新增 `setSessionConfigOptions(sessionId: string, options: AcpSessionConfigOption[])` action，行为与 `setSessionAvailableCommands` 对称：找到对应 session 后赋值。

新增 case SHALL 保持 switch 的 TypeScript 穷尽检查（`default: { void data; throw ... }`）。

`MessageAssembler`/`useUIMessageAssembler` SHALL NOT 感知 `config_options_update`，事件不进入消息组装通路。

#### Scenario: chunk 到达后替换 session.configOptions

- **WHEN** chat store 在 `streamSessionMessage.onChunk` 收到 `{ kind: "config_options_update", options: [<3 项>] }`
- **THEN** 不修改 `activeSession.messages`
- **AND** 调用 `useSessionStore().setSessionConfigOptions(activeSession.id, options)`，覆盖 `Session.configOptions`

#### Scenario: 空数组覆盖

- **WHEN** chunk 携带 `options: []`
- **THEN** `Session.configOptions` 被赋值为 `[]`
- **AND** 触发 ConfigOptionsBar 隐藏

### Requirement: chat store 提供 setConfigOption action 并支持乐观更新与回滚

`frontend/src/stores/chat.ts` SHALL 新增 `setConfigOption({ sessionId, configId, type, value })` action：

1. 找到目标 session（不强制要求是 `activeSession`，但若不存在则直接抛错）。
2. 在 `Session.configOptions` 中找到 `configId` 对应项，记录旧值 `previousValue`。若找不到目标项，SHALL 抛错（前端 UI 不应允许该路径，仅作防御）。
3. 立即把该项的 `currentValue` 设为目标 `value`（乐观更新），并把"该项 isPending = true"反映到 UI（用 store 内独立的 `pendingConfigIds: Set<string>` 维护，不污染 ACP 字段）。
4. 调用 `chatApi.setConfigOption({ projectId: session.projectId, sessionId, configId, type, value })`。
5. 成功：从响应 `data.configOptions` 调用 `setSessionConfigOptions(sessionId, ...)` 全集替换；从 `pendingConfigIds` 移除该 `configId`。
6. 失败：把 `currentValue` 回滚到 `previousValue`；从 `pendingConfigIds` 移除该 `configId`；通过 `useToast()` 显示错误（`error.message` 优先）。

`ConfigOptionItem` SHALL 在该项 `isPending === true` 时禁用交互并显示 spinner（如 `i-lucide-loader-2 animate-spin`）。

#### Scenario: 成功路径用响应替换全集

- **WHEN** 用户切 model = sonnet
- **AND** IPC 返回 `{ ok: true, data: { configOptions } }`
- **THEN** chat store 把 `Session.configOptions` 替换为响应值
- **AND** `pendingConfigIds` 不再包含该 `configId`

#### Scenario: 失败路径回滚 currentValue

- **WHEN** IPC 返回 `{ ok: false, error: { code: "CONFIG_OPTION_INVALID_VALUE", message } }`
- **THEN** chat store 把该项 `currentValue` 回滚到 `previousValue`
- **AND** 通过 `useToast()` 显示错误信息
- **AND** `pendingConfigIds` 不再包含该 `configId`

#### Scenario: 进行中禁用触发器

- **WHEN** `pendingConfigIds` 包含某 `configId`
- **THEN** `ConfigOptionItem` 触发器按钮禁用，显示 spinner

### Requirement: turn 进行中 server-push 覆盖乐观值

`config_options_update` chunk SHALL 直接全集替换 `Session.configOptions`，包括对正在 pending 的项也直接覆盖 `currentValue`。这是 ACP 协议本身定义的"agent 可主动修改 configOptions"语义。

任何因此产生的"用户乐观值与最终值不一致"SHALL NOT 触发回滚或额外 toast；UI 显示以最新全集为准。

#### Scenario: 用户乐观改值 + agent 同时 push 不同值

- **WHEN** 用户点击 model = sonnet（乐观值生效，pendingConfigIds 含 model）
- **AND** ACP turn 中收到 `config_option_update` server-push，model 的 currentValue 为 haiku
- **THEN** chunk 处理器全集替换 `Session.configOptions`，model 的 currentValue 为 haiku
- **AND** 不触发回滚 toast
- **AND** `pendingConfigIds` 因后续 IPC 响应到达时移除该项（与失败/成功正常路径一致）
