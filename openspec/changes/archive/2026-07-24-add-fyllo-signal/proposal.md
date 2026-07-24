## Why

FylloCode 目前只有需要用户确认的 Fyllo Action，缺少一种可由 agent 在对话中输出、无需用户操作且不进入 EventRail 的轻量展示协议。新增 Fyllo Signal 可以承载这类被动信息，同时复用已经验证过的 Action Markdown 边界和 Markstream 防误解析机制，避免维护两套容易漂移的标签规则。

## What Changes

- 新增 agent-facing 的 `<fyllo-signal type="...">` 严格 JSON 标签协议，以及编译期穷尽的 Signal registry、payload schema 和 semantic parser。
- 新增与 Fyllo Action 一致的 standalone Markdown block、代码区域 literal、闭合后提交和前后空行规则；未闭合标签继续按普通 Markdown 文本处理。
- 抽取 Fyllo Action 当前源码 analyzer 与 Markstream internal-tag/placeholder 适配中的通用部分，供 Action 和 Signal 共同使用；Action 的候选判定、source ordinal、注册、状态和持久化行为保持不变。
- 在 `src/renderer/src/features/fyllo-signal/` 建立轻量 renderer feature。Shell 只提供无预设视觉的容器，各 Signal type 组件拥有自身样式和交互。
- 仅在 Chat 的 assistant text part 中显式启用 Signal；reasoning、tool、Specs、Guidelines、Knowledge 等其他 MarkStream 宿主不启用。
- 在 Chat system-reminder 中注入 `<fyllo-signal-contract>`，并与 Fyllo Action 共用标签结构、换行、literal 示例和尖括号编码规则。
- 首个真实 type 为 `show.time`，用于完整验证 prompt → agent 输出 → Markdown analysis → Markstream → type UI 的链路；该 type 当前作为正常启用的 Signal contract，不引入特殊测试旁路。
- Signal 不建立独立 IPC、状态机、Action identity、持久化记录或 EventRail contributor。

## Capabilities

### New Capabilities

- `markstream-custom-tag-parsing`: 定义 MarkStream 中 agent-facing 自定义标签共用的 standalone candidate、literal、流式闭合提交和 render-only transport 规则；本次接入 Fyllo Action 与 Fyllo Signal，未来其他自定义标签继续扩充此 capability。
- `fyllo-signal-prompt-contract`: 定义 Signal registry、`<fyllo-signal-contract>` system-reminder 注入、严格 JSON 示例和换行约束。
- `fyllo-signal-rendering`: 定义 Chat 启用边界、Markstream 渲染、无样式 Shell、type-owned UI、invalid fallback，以及 `show.time` 展示行为。

### Modified Capabilities

无。Fyllo Action 仅进行等价的内部复用重构，现有 OpenSpec requirements 不变。

## Impact

- Shared：新增 Fyllo Signal protocol/schema/registry/parser/prompt，并抽取 Action/Signal 共用的 Markdown tag analysis 与 prompt formatting 原语。
- Renderer：新增 `src/renderer/src/features/fyllo-signal/`，抽取 Markstream 通用标签适配，更新 `MarkStream.vue`、`ChatMessageList.vue` 和 `AssistantMessage.vue` 的显式启用与组件注册。
- Main：更新 Chat system-reminder provider 以追加 Signal prompt contract；不新增 IPC、service 或 storage。
- Tests：增加 shared parser/prompt、Markstream Action+Signal 组合、Chat enablement、Signal node/Shell 和 `show.time` 回归测试，并保证既有 Fyllo Action 测试继续通过。
- Dependencies：不新增第三方依赖，不修改持久化格式。
