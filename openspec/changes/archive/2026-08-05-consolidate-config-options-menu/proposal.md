## Why

ChatPrompt footer 当前按 Agent 返回的 `configOptions` 数量横向渲染多个控件，Agent 增加配置类型后会持续占用输入区宽度。ACP 同时已要求客户端显式声明 boolean config option 支持，因此需要在保持现有配置状态与提交流程的前提下，提供一个可扩展的紧凑入口并补齐连接初始化声明。

## What Changes

- 将 ChatPrompt footer 中多个并列配置控件收敛为单一配置菜单触发按钮；按钮优先显示当前 `category=model` 与 `category=thought_level` 的 value name，例如 `GPT-5.5 · High`。
- 让 select 配置作为一级菜单项并通过子菜单展示 flat/grouped values；让 boolean 配置作为一级 checkbox 直接切换，不为 true/false 创建子菜单。
- 菜单保持 Agent 提供的 `configOptions` 原始顺序并兼容缺失、重复或未知 category；触发摘要缺少 model/thought level 时使用确定性的降级文案。
- 继续在 ConfigOptions 组件内部隐藏 `category=mode`，ChatPromptPanel 不感知过滤规则或菜单内部结构；未来 mode 展示可在该组件内部增加独立入口。
- 在现有 `@agentclientprotocol/sdk` 0.25.x 连接实现上尝试发送 `clientCapabilities.session.configOptions.boolean: {}`，复用已经存在的 boolean 解析、持久化、恢复和设置链路。
- 不升级 ACP SDK，不新增 initialize payload 专项测试，不改变配置持久化格式、IPC surface 或 Agent 返回完整 snapshot 后的替换语义。

## Capabilities

### New Capabilities

- `chat-session-config-controls`: 定义 ChatPrompt 配置单一入口、摘要降级、select 子菜单、boolean checkbox、Agent 顺序和 mode 隐藏行为。

### Modified Capabilities

- `acp-agent-connection-lifecycle`: ACP initialize 请求新增 boolean session config option 客户端能力声明，同时保持当前 SDK 版本和既有连接生命周期不变。

## Impact

- Renderer：`src/renderer/src/components/chat/prompt/ConfigOptionsBar.vue`、`ConfigOptionItem.vue` 及对应组件测试。
- Main/ACP：`src/main/infra/process/acp-process-pool.ts` 的 initialize payload，以及现有 boolean config option 类型与设置链路。
- 依赖：继续使用当前 `@agentclientprotocol/sdk` 0.25.x 和 `@nuxt/ui` 的 `UDropdownMenu` nested children / checkbox 能力，不修改依赖版本。
- 不受影响：session config IPC、store action、持久化与 cold recovery 算法、`category=mode` 的现有隐藏策略、ChatPromptPanel 对 ConfigOptions 的外部调用方式。
