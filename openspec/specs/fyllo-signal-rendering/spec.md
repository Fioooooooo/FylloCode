# fyllo-signal-rendering Specification

## Purpose

规定 Fyllo Signal 在 Chat assistant text 中的显式启用、闭合后渲染和非交互展示边界；共享 Shell 仅承载节点，具体 Signal type 自主管理视觉，且不参与 Action 状态、EventRail 或 session attention。

## Requirements

### Requirement: Signal 只在 Chat assistant text part 中显式启用

Renderer SHALL 仅在 `ChatMessageList` 的 `type="chat"` 路径为 assistant text part 启用 Fyllo Signal。Signal enablement SHALL 与 Action enablement 分离，不依赖 project ID、session ID、message index、Action state 或 Action registration context。

User message、reasoning part、tool part，以及 Specs、Guidelines、Knowledge、Proposal、Subagent inspector 等其他 MarkStream 宿主 SHALL 保持 Signal 关闭。

#### Scenario: Chat assistant text enables Signal

- **WHEN** `ChatMessageList` 以 `type="chat"` 渲染 assistant text part
- **THEN** `AssistantMessage` SHALL 为对应 `MarkStream` 显式传递 `enableSignals=true`
- **AND** ready Signal SHALL 可以创建 Signal custom node

#### Scenario: Missing Action context does not disable Signal

- **WHEN** Chat assistant text 缺少完整 Action registration context
- **THEN** Action 可以保持关闭
- **AND** Signal SHALL 仍由 Chat 类型独立决定是否开启

#### Scenario: Non-Chat hosts keep Signal literal

- **WHEN** Specs、Guidelines、Knowledge、Proposal 或其他非 Chat 宿主的 Markdown 包含完整 Fyllo Signal 标签
- **THEN** 宿主 SHALL 不注册 Signal custom tag
- **AND** 内容 SHALL 继续走普通 Markdown 渲染

### Requirement: Fyllo Signal renderer 位于独立 feature

Renderer implementation SHALL 位于 `src/renderer/src/features/fyllo-signal/`，并 SHALL 提供 feature README、根公共入口、UI 层和 Markstream integration 入口。feature SHALL 不创建无实际责任的 model/application 层。

feature 外部 SHALL 通过根入口或 README 声明的 integration 入口使用 Signal，不得深路径导入其 UI 内部文件。

#### Scenario: MarkStream consumes the integration entry

- **WHEN** shared `MarkStream.vue` 注册 Signal adapter 和 component
- **THEN** import SHALL 来自 `@renderer/features/fyllo-signal/integration`
- **AND** SHALL 不直接导入 `ui/FylloSignalNode.vue`

#### Scenario: Feature contains only required layers

- **WHEN** 查看 Fyllo Signal feature 结构
- **THEN** 它 SHALL 包含 README、公开入口、ui 和 integration
- **AND** SHALL 不为目录对称创建空 model 或 application

### Requirement: Shell 只提供无预设视觉的容器

`FylloSignalShell.vue` SHALL 只提供 Signal host container、必要 data attributes 和 slot。Shell SHALL 不统一定义边框、背景、圆角、图标、标题、hover、点击处理、按钮或 type presentation metadata。

每个 ready Signal type component SHALL 自行拥有其视觉、布局和可选交互，并 SHALL 遵守项目 UiDesign 的语义颜色、focus 和 motion 规则。

#### Scenario: show.time owns its presentation

- **WHEN** `show.time` ready payload 被渲染
- **THEN** 时钟图标、pill 边框、背景、间距和 label SHALL 由 `ShowTimeSignal.vue` 定义
- **AND** `FylloSignalShell.vue` SHALL 不提供这些 class 或 icon

#### Scenario: A future type can use a different layout

- **WHEN** 后续 Signal type 需要与 `show.time` 不同的块级或交互布局
- **THEN** 该 type component SHALL 能在不修改 Shell presentation API 的情况下定义自身 UI

### Requirement: Ready 和 invalid Signal 使用不同渲染路径

`FylloSignalNode.vue` SHALL 对 ready parse result 从 renderer registry 选择精确 type component并传入 typed payload。closed candidate 的 semantic validation 失败时，Node SHALL 在无样式 Shell 中显示非交互的通用 invalid fallback 和可用 parser details，SHALL 不调用任何 type component。

未闭合 occurrence 不会创建 Node，因此 SHALL 没有可见 pending Signal 或骨架。

#### Scenario: Ready payload reaches exact type component

- **WHEN** Signal semantic parser 返回 `ready` 的 `show.time` payload
- **THEN** renderer SHALL 选择 `ShowTimeSignal.vue`
- **AND** SHALL 把 validated payload 作为 prop 传入

#### Scenario: Invalid candidate shows generic fallback

- **WHEN** closed standalone Signal candidate 的 type、JSON 或 payload 无效
- **THEN** renderer SHALL 显示通用 invalid Signal 文本和可用 details
- **AND** SHALL 不渲染 `ShowTimeSignal.vue` 或任何其他 type component

#### Scenario: Unclosed Signal has no skeleton

- **WHEN** streaming content 中的 Fyllo Signal 尚未闭合
- **THEN** renderer SHALL 不创建 `FylloSignalShell` 或 pending skeleton

### Requirement: show.time 展示 validated label

`ShowTimeSignal.vue` SHALL 将 validated `label` 显示为带时钟图标的紧凑、非交互 pill。组件 SHALL 自行拥有全部 presentation class，SHALL 不提供确认、取消、重试或点击行为。

#### Scenario: Current time renders as a passive pill

- **WHEN** ready `show.time` payload 为 `{ "label": "2026-07-23 14:30" }`
- **THEN** UI SHALL 显示时钟图标和 `2026-07-23 14:30`
- **AND** SHALL 不显示操作按钮或可点击状态

### Requirement: Signal 不参与 Action 生命周期和提醒

渲染 Fyllo Signal SHALL 不创建 Action ID，不调用 Action IPC，不写入 session `actionStates`，不改变 session attention，也不向 EventRail 添加 item。历史 Signal 的展示 SHALL 仅由已持久化的 assistant message text 重新解析得到。

#### Scenario: Rendering Signal has no durable side effect

- **WHEN** ready Signal 在 Chat 中首次挂载或重复挂载
- **THEN** Renderer SHALL 不调用 `registerAction`、`transitionAction` 或 `persistActionState`
- **AND** Main SHALL 不产生新的 Signal storage record

#### Scenario: Signal does not enter EventRail

- **WHEN** 会话包含一个或多个 ready Signal
- **THEN** EventRail 和 session attention count SHALL 与不存在这些 Signal 时相同
