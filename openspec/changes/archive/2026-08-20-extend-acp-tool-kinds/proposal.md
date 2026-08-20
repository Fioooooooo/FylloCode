## Why

ACP SDK 1.3.0 已定义 delete、move、think、fetch、switch_mode 等工具类型，但 FylloCode Renderer 仍只识别早期的 read、write、edit、search、execute 与 other。因此新 Agent 的合法工具类型会丢失明确的图标、Activity 摘要和用户语义；例如 Kimi 的 WebSearch 会以 fetch 上报，却只能显示为通用工具。

现在补齐统一工具词汇，可以让 Main/Shared 保留 ACP 原始 kind，并让 Renderer 对 SDK 1.3.0 类型提供稳定、可测试且向后兼容的展示。该变更不依赖 Agent ID，不包含 Kimi 专属适配器或子 Agent 接入。

## What Changes

- 将 Renderer 的 canonical ToolKind 扩展为 ACP 1.3.0 已知类型：delete、move、think、fetch、switch_mode。
- 保留历史兼容的 write；未知、空值或未来新增的 ACP kind 继续安全回退为 other。
- 为新增类型补充稳定的 Lucide 图标、Activity 摘要动词与名词，并保持普通工具、Activity group、历史消息使用同一映射。
- 保留 Main mapper 与 Shared toolKind: string 的 Agent-neutral 边界，不把 ACP SDK 类型导入 Shared，也不按 Agent ID 做特殊映射。
- 增加 mapper、Renderer 工具语义、Activity 摘要和未知值回退测试。

## Capabilities

### New Capabilities

- acp-tool-kind-vocabulary：定义 ACP 工具 kind 的 canonical Renderer 词汇、兼容回退、图标和 Activity 摘要映射。

### Modified Capabilities

- assistant-activity-display：Activity group 的类别统计和代表图标支持新增 ACP 工具类型。

## Impact

- 受影响代码：src/renderer/src/utils/chatTool.ts、src/renderer/src/utils/chatAssistant.ts 及其 Renderer 测试；ACP mapper 测试补充原始 kind 保真覆盖。
- 受影响用户界面：新增工具类型的标题摘要和图标；旧 write、other、未知类型和历史工具仍可展示。
- 不改变：ACP 依赖版本、Shared 事件字段、持久化 schema、Agent adapter registry、Agent ID、子 Agent parent/child 关系和 Kimi 专属行为。
