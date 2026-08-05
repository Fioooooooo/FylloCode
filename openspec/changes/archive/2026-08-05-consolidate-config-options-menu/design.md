## Context

`ConfigOptionsBar.vue` 当前从 active session 或 ready draft probe 读取完整 `configOptions` snapshot，过滤 `category=mode` 后按已知 category 重排，并为每个 option 渲染一个 `ConfigOptionItem.vue`。select option 各自拥有 `UDropdownMenu` 触发按钮，boolean option 各自渲染 `USwitch`，因此 footer 宽度与配置数量线性增长。

现有 main、shared、renderer store 与 recovery 链路已经支持 `type=boolean` 及 `session/set_config_option` 的 `{ type: "boolean", value: boolean }` 请求，但 `acp-process-pool.ts` 初始化连接时仍发送 `clientCapabilities: {}`。仓库使用 `@agentclientprotocol/sdk` 0.25.x；该版本已具备 boolean option/request 类型，但 `ClientCapabilities` 尚未声明新的 `session.configOptions.boolean` 字段。

本变更必须遵守以下约束：不升级 ACP SDK；不增加 initialize payload 专项测试；不改变 IPC、store、持久化或 cold recovery；`category=mode` 继续只在 ConfigOptions 内部隐藏；菜单必须消费 Agent 每次返回的完整 snapshot，不能缓存独立配置副本。

## Goals / Non-Goals

**Goals:**

- 将任意数量的可见 session config options 收敛到 ChatPrompt footer 的单一触发按钮。
- 用 model 与 thought level 当前 value name 形成紧凑摘要，并对缺失 category、重复 category 和 value name 缺失提供确定性降级。
- 复用 Nuxt UI 原生 nested menu 与 checkbox 语义展示 select 和 boolean 配置。
- 保留 Agent 原始 option 顺序、flat/grouped value、描述、pending 禁用和完整 snapshot 替换行为。
- 在不升级 SDK 的前提下为 initialize payload 增加 boolean config capability marker。

**Non-Goals:**

- 展示或修改 `category=mode`。
- 升级 `@agentclientprotocol/sdk`，或迁移到 0.27+ 的新 SDK connection API。
- 新增 text、number、range 等 ACP 尚未由当前应用支持的 option type。
- 修改 session config IPC、store action、持久化 schema、恢复顺序或错误 toast。
- 为 initialize payload 新增专项序列化/wire 测试。
- 在本次变更中将菜单升级为通用设置 popover；未来出现非菜单型输入时可在不改变 ChatPromptPanel 的前提下替换内部 surface。

## Decisions

### 使用一个外层 `UDropdownMenu` 作为唯一 footer 入口

`ConfigOptionsBar.vue` 保持 ChatPromptPanel 的既有组件边界，但模板只渲染一个 `UDropdownMenu` 和一个 trigger `UButton`。该组件继续拥有 source selection、mode filtering 和 draft/session dispatch，因此 `ChatPromptPanel.vue` 无需新增 props、events 或配置知识。

选择 nested dropdown 而不是 popover panel，是因为当前支持类型只有 select 与 boolean，均符合 menu 交互；`@nuxt/ui` 当前 `DropdownMenuItem` 已原生提供 `children`、`type: "checkbox"`、`checked`、`onUpdateChecked`、`loading` 和 `disabled`。未来若协议引入文本或范围输入，可以只替换 ConfigOptions 内部 surface。

### select 使用子菜单，boolean 使用一级 checkbox

每个可见 select option 投影为一级菜单项：label 为 option name，description 或 trailing content 显示当前 value name，`children` 包含可选 value。flat options 直接生成 children；grouped options 保留 group label 与组内顺序；当前值在子菜单中显示选中状态。value description 继续通过菜单描述或 tooltip 呈现。

每个 boolean option 投影为一级 `type: "checkbox"` 项，`checked` 绑定 `currentValue`，`onUpdateChecked` 复用既有 `handleChange(option, value)`。这样不创建语义空洞的 true/false 子菜单，也不在 footer 增加独立 switch。

二级 value description 保留 DropdownMenu 默认的一行截断，以维持菜单密度和信息可发现性；仅对带 description 的 value 分配专用 description slot，并在悬停该行时通过可换行 tooltip 展示完整文本。一级 config 当前值、boolean description 和 group label 不使用该 slot。

pending 状态只禁用并标记对应 option；其他 option 和外层 trigger 保持可用。提交仍进入 `sessionStore.setDraftConfigOption` 或 `chatStore.setConfigOption`，成功后以 Agent 返回的完整 snapshot 重新计算菜单和摘要。

### 摘要只提升 category，不重排菜单

菜单从过滤后的 `configOptions` 保留 Agent 原始顺序，不再使用 `KNOWN_PRIORITY` 重排。摘要按原始顺序分别取第一个 `type=select && category=model` 和第一个 `type=select && category=thought_level`：

- 两者存在时以 `·` 连接 value name；
- 只有一个时只显示该 value name；
- 两者都不存在时显示固定文案 `Config`；
- value 未在 flat/grouped options 中匹配时回退到 raw `currentValue`。

trigger 文案不设置最大宽度且不截断，完整显示配置摘要；tooltip / `aria-label` 继续提供相同的完整文案。category 仅用于展示增强；未知 category 仍按 Agent 顺序进入菜单。`category=mode` 在任何摘要或主菜单投影前过滤；若过滤后为空，则不渲染 trigger。

### 删除并吸收 `ConfigOptionItem.vue` 的投影职责

单个外层 `UDropdownMenu` 需要一次性获得完整 nested item tree，因此 `ConfigOptionItem.vue` 不再适合作为每个 option 的独立 trigger。将其 current label、flat/grouped value 与 icon 投影逻辑收敛到 `ConfigOptionsBar.vue` 的纯 helper/computed 中，并删除该 SFC 与独立组件测试；相关行为统一由 `config-options-bar.spec.ts` 覆盖。该能力仍是单一 Chat composer UI，不创建新的 renderer feature 或 domain store。

### 在旧 SDK 上使用窄类型扩展发送 capability

`acp-process-pool.ts` 定义局部的 boolean config client capability 结构，并用其构造：

`{ session: { configOptions: { boolean: {} } } }`

该对象作为变量传给 `connection.initialize`，利用 TypeScript 结构类型允许额外字段且 SDK 0.25.x `sendRequest` 原样发送 params 的现有行为。不得修改 SDK 包、patch node_modules、使用 `_meta` 模拟标准字段或升级依赖。若 Agent 不返回 boolean options，后续流程与现在相同。

按用户约束，不新增 initialize payload 专项测试；Apply 仅通过现有聚焦测试、`pnpm typecheck:node` 和 renderer 类型检查证明此窄扩展没有破坏当前构建契约。不得运行 `pnpm build`，除非用户另行明确授权。

## Risks / Trade-offs

- [嵌套子菜单在 option 数量极多时需要更多指针移动] → 主菜单设置可视高度与滚动；保持单一 footer 入口。若未来出现非菜单型 option，再将内部 surface 迁移为 popover。
- [model 或 thought level 并非所有 Agent 都提供] → 摘要使用单项与 `Config` 固定降级，不把 category 当作正确性前提。
- [model 变化可能重塑 thought level schema] → 不缓存 submenu；每次提交后以 store 中 Agent 完整 snapshot 重建全部 items 与摘要。
- [旧 SDK 类型落后于当前协议字段] → 只在 `acp-process-pool.ts` 使用窄局部类型扩展，不污染 shared contract；不升级依赖。若后续 SDK 升级，移除该兼容类型并改用官方 `ClientCapabilities`。
- [菜单重排移除会改变现有测试和视觉顺序] → 按 ACP 的 Agent priority 语义更新组件测试，摘要仍优先呈现 model/thought level。
- [不增加 initialize payload 专项测试降低回归可见性] → 接受该用户指定的权衡；依靠 node typecheck 和实际 Agent 集成观察，不把 SDK 升级纳入本变更。
