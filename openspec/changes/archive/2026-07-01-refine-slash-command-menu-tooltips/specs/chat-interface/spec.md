## MODIFIED Requirements

### Requirement: ChatContainer 集成 slash 命令菜单

系统 SHALL 在 chat prompt 输入区（当前实现位于 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue`，历史 spec 文本指向 `ChatContainer.vue`，以实际承载 `UChatPrompt#footer` 的组件为准）的 `UChatPrompt` 组件内集成 slash 命令菜单，并在 footer 左侧渲染一个 slash 触发按钮，用于发现与使用当前 agent 声明的可用命令。

slash 命令的数据源 SHALL 为「双源回退」计算属性，与 `ConfigOptionsBar.vue` 的 `sourceOptions` 模式一致：

```ts
const availableCommands = computed<AcpAvailableCommand[]>(() => {
  if (activeSession.value) {
    return activeSession.value.availableCommands ?? [];
  }
  return activeDraftProbe.value?.status === "ready" ? activeDraftProbe.value.availableCommands : [];
});
```

即：存在 `activeSession` 时读 `activeSession.availableCommands`；草稿态（`activeSession` 为 `null`）时回退读 `activeDraftProbe`（ready 时取其 `availableCommands`，否则空数组）。这是 slash command 在「首条消息发送前」即可用的关键——草稿期 probe 抓到的命令通过此回退路径暴露给 slash 菜单。

具体要求：

- **按钮可见性**：在 `UChatPrompt` 的 footer 左侧渲染一个 slash 按钮，图标为 `i-lucide-slash-square`，可见条件 SHALL 改为基于上述 `availableCommands` 计算属性：`v-if="availableCommands.length > 0"`。`availableCommands` 为空数组时按钮不渲染。

- **按钮组件**：统一使用 `UButton variant="ghost" size="sm"` 包裹 `UIcon name="i-lucide-slash-square"`；不使用 `USlot` / `UChip` 等其他组件。

- **菜单组件**：点击按钮打开命令菜单。首选 `@nuxt/ui` 的 `UCommandPalette`（支持搜索、键盘导航、回车选中、ESC 关闭）；若其与 `UChatPrompt` 内嵌布局冲突，降级为 `UPopover` + `UListbox` + `UInput` 的组合，保持键盘导航 / 回车选中 / ESC 关闭 / 鼠标点击选中四项能力。菜单项 SHALL 只展示单行主文本 `/<command.name>`，不得在列表项内直接渲染 `command.description`，也不得保留空的 description 行或 description 容器高度。菜单浮层 SHALL 使用适合单行 label 列表的紧凑宽度，不沿用两行详情列表所需的宽面板宽度。

- **菜单详情 tooltip**：当某条命令被鼠标 hover 或通过键盘上下方向键高亮时，系统 SHALL 在菜单右侧展示该命令的详情 tooltip。tooltip SHALL 只展示非空字段：
  - `command.description` 非空时展示 description；
  - `command.hint` 非空时以 `用法: /<command.name> <hint>` 形式展示完整用法；若 `command.hint` 已经是以 `/` 开头的完整用法，则 SHALL 直接展示该 hint，不重复拼接命令名；
  - 两者都非空时同时展示，description 在上，hint 在下；
  - 两者都为空或仅为空白时不展示 tooltip。
    tooltip SHALL 使用固定的可读宽度、视口内最大宽度和最大高度约束；当 description 或 hint 过长时，内容 SHALL 在 tooltip 内换行并纵向滚动，不得撑破浮层或溢出视口。

- **详情同步语义**：鼠标 hover 和键盘高亮 SHALL 共享同一套高亮项状态。键盘上下方向键移动高亮项时，tooltip SHALL 更新到当前高亮项；高亮项清空、菜单关闭或 commands 变为空时，tooltip SHALL 关闭并清空其 DOM reference。

- **菜单排序与数量**：菜单初始打开且搜索词为空时 SHALL 展示全部 `availableCommands`，顺序与数据源数组一致，不得因 `UCommandPalette` 默认 result limit 截断，也不得因 Fuse 默认排序改变顺序。搜索时仍 SHALL 允许根据命令 label、description 和 hint 匹配命令；搜索结果顺序 SHALL 保持原始 `availableCommands` 中的相对顺序。

- **菜单交互**：SHALL 支持键盘上下方向键导航、回车选中、ESC 关闭；支持鼠标点击选中。菜单打开时焦点落在菜单搜索输入或首个选项；菜单关闭后焦点回到输入框当前位置。

- **`/` 键触发条件**：当用户在输入框按下 `/` 键、输入框聚焦、且光标处于「行首」（定义见下）、且 `availableCommands.length > 0`（读上述计算属性，覆盖草稿态）时，菜单 SHALL 在浏览器把 `/` 写入 textarea 后打开。palette 初始搜索词 SHALL 为空，不得把触发用的 `/` 带入 command palette 搜索框。

  **「行首」定义**：设 `text = textarea.value`、`cursor = textarea.selectionStart`，令 `prefix = text.slice(0, cursor)`；若 `prefix` 不包含 `\n`，则其中仅有空白字符（空格或 tab）或为空串时视为行首；若 `prefix` 包含 `\n`，则取最后一个 `\n` 之后到 cursor 之间的子串，该子串仅有空白字符或为空串时视为行首。此定义支持多行输入的第二行起继续唤起菜单。

- **`/` 键不阻止默认**：keydown handler SHALL NOT 调用 `event.preventDefault()`。浏览器会把 `/` 写入 textarea，菜单在 input/keyup 后打开；当用户随后选中命令时，组件负责替换该 `/`（见插入规则）。当用户按 ESC 或点外侧关闭菜单且未选择命令时，已写入的 `/` 保留在输入框中（由用户决定是否删除）。

- **插入规则**：选中命令后：
  - 若菜单由 `/` 键触发（由组件内部状态标记），组件需找到当前光标位置向左的第一个 `/` 字符（保证它就是触发菜单那一个），将其替换为 `/<name> `（末尾含一个 ASCII 空格）。若因用户在菜单打开后继续输入删除了该 `/`，则降级为「在当前光标位置插入 `/<name> `」。
  - 若菜单由按钮点击触发，直接在当前光标位置插入 `/<name> `；若光标位置左侧最末非空白字符恰为非空格（例如 `hello`），插入前 SHALL 自动补一个空格，即实际插入 `/<name>`；否则直接插入 `/<name> `。
  - 插入完成后光标置于新末尾，焦点回到输入框，菜单关闭。

- **Hint placeholder 行为**：选中命令后若 `command.hint` 为非空字符串，组件 SHALL：
  1. 记录基准值 `baseline = textarea.value`（即命令插入完成后的值）；
  2. 将 `UChatPrompt` 的 `placeholder` prop 临时覆盖为 `command.hint`；
  3. 监听 textarea 的 `input` 事件：当 `textarea.value !== baseline` 时恢复默认 `placeholder`，取消监听；
  4. 监听 textarea 的 `blur` 事件：一旦触发恢复默认 `placeholder`，取消监听；
  5. 若再次选中另一个带 hint 的命令，新 hint 覆盖旧 hint，基准值更新。
     若 `command.hint` 为 `undefined` 或空串，不修改 placeholder，也不监听 input / blur。

- **菜单关闭状态管理**：菜单关闭不清空输入框当前内容；菜单重开时重置搜索词为空、焦点回到第一项。

- **空态隐藏**：当上述 `availableCommands` 计算属性为空数组时，按钮不渲染；`/` 键 keydown handler SHALL 读取最新 `availableCommands.length`，发现不满足条件时直接返回（不打开菜单），让 `/` 按普通字符输入；不需要 preventDefault。

#### Scenario: agent 推送命令后按钮出现

- **WHEN** 用户处于某 session，`activeSession.availableCommands` 从 `undefined` 变为 `[{ name: "review", description: "Review code" }]`
- **THEN** `UChatPrompt` footer 左侧出现 slash 触发按钮
- **AND** 按钮点击可打开菜单，列表展示 `/review`
- **AND** 列表项内不展示 `Review code`
- **AND** hover 或键盘高亮 `/review` 时，右侧 tooltip 展示 `Review code`

#### Scenario: 草稿态 probe 抓到命令后按钮出现

- **WHEN** `activeSession` 为 `null`（草稿态），`activeDraftProbe.value.status === "ready"`，其 `availableCommands` 为 `[{ name: "init", description: "Initialize", hint: "[path]" }]`
- **THEN** slash 触发按钮在首条消息发送前即渲染
- **AND** 输入框聚焦、内容为空时按 `/` 可打开菜单，列表展示 `/init`
- **AND** hover 或键盘高亮 `/init` 时，右侧 tooltip 同时展示 `Initialize` 和 `用法: /init [path]`

#### Scenario: 草稿态 probe 未就绪时按钮隐藏

- **WHEN** `activeSession` 为 `null`，`activeDraftProbe` 为 `null` 或 `status !== "ready"`
- **THEN** slash 按钮不渲染
- **AND** 按 `/` 不打开菜单，按普通字符输入

#### Scenario: 命令列表只显示 label 且保留原始顺序

- **WHEN** `availableCommands` 包含多条命令，且部分命令带有 description 或 hint
- **AND** 用户通过按钮或 `/` 打开 slash command 菜单
- **THEN** 菜单列表展示全部命令的 `/<command.name>`
- **AND** 列表顺序与 `availableCommands` 数组顺序一致
- **AND** 列表项内不展示 description 或 hint

#### Scenario: hover 命令时展示可用详情

- **WHEN** 某 command 的 `description === "Review code"` 且 `hint === "[path]"`，用户 hover 该 command
- **THEN** 右侧 tooltip 展示 `Review code`
- **AND** 右侧 tooltip 展示 `用法: /review [path]`

#### Scenario: 长详情限制在 tooltip 内

- **WHEN** 某 command 的 description 或 hint 很长
- **AND** 用户 hover 或键盘高亮该 command
- **THEN** 右侧 tooltip 使用受限宽度和最大高度展示内容
- **AND** 长文本在 tooltip 内换行或纵向滚动，不撑破浮层

#### Scenario: 键盘高亮命令时同步展示可用详情

- **WHEN** slash command 菜单打开
- **AND** 用户通过上下方向键把高亮项移动到某 command
- **THEN** 右侧 tooltip anchor 到当前高亮项
- **AND** tooltip 内容来自当前高亮 command 的非空 `description` 与 `hint`

#### Scenario: 无详情命令不展示空 tooltip

- **WHEN** 某 command 的 `description` 与 `hint` 均为 `undefined`、空串或仅空白字符
- **AND** 用户 hover 或键盘高亮该 command
- **THEN** 系统不展示详情 tooltip

#### Scenario: slash 触发不把斜杠带入 palette 搜索

- **WHEN** 输入框聚焦、内容为空、`availableCommands.length > 0`
- **AND** 用户按下 `/`
- **THEN** 浏览器把 `/` 写入 textarea
- **AND** slash command 菜单打开
- **AND** command palette 的搜索词为空字符串
- **AND** 菜单初始顺序仍与 `availableCommands` 数组一致

### Requirement: ConfigOptionItem 下拉菜单项的 description 展示

`ConfigOptionItem` SHALL 在渲染 `UDropdownMenu` 时让下拉菜单项默认只显示 `AcpSessionConfigOptionValueItem.name`；若该项存在 `description`，则在鼠标 hover 时于菜单项右侧通过 `UTooltip` 显示完整 description。

#### Scenario: 有 description 的选项项 hover 显示 tooltip

- **WHEN** 某 select option 的 value item 存在 `description`
- **THEN** 下拉菜单中该项只显示 `name`
- **AND** 鼠标 hover 时在该项右侧显示包含完整 `description` 的 tooltip

#### Scenario: 无 description 的选项项不显示 tooltip

- **WHEN** 某 select option 的 value item 不存在 `description`
- **THEN** 下拉菜单中该项只显示 `name`
- **AND** 不渲染 description tooltip
