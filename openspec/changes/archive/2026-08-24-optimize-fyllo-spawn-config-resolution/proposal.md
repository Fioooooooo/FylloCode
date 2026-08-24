## Why

`prompt_to_agent` 当前只接受按 ACP option ID 编写的 `config`，但 option ID、模型 value 与候选列表只有在真实 Session 的 `newSession` 之后才可知，父 Agent 因而常需先创建一次无意义的探测 turn。FylloCode 需要让父 Agent 在首次正式调用中表达模型与思考强度意图，并仅在 live options 确实不唯一时进入可恢复澄清。

## What Changes

- 为 `prompt_to_agent` 增加可选 `model` 与 `thought_level` 字段；两者分别通过 ACP live config option 的 `category=model` 与 `category=thought_level` 定位真实 option ID，而不是假设不同 Agent 使用相同 key。
- 在真实 spawned ACP Session 的 `newSession`、resume 或 load 返回后解析语义配置：优先精确 value/name，再执行保守且确定性的归一化匹配；零匹配或多匹配均不发送 prompt，而是返回带候选 options 的 `configuration_required`。
- 先应用 model，再使用 `setSessionConfigOption` 返回的完整新 snapshot 解析 thought level；当配置依赖重塑 live schema 时，采用有限迭代和 snapshot 重复检测收敛，避免无限设置。
- 明确新增语义字段与现有 `config: Record<string, string | boolean>` 的边界：`config` 继续只接受精确 option ID；同一目标和值去重，同一目标的冲突值拒绝，禁止依赖 JSON object 顺序或静默覆盖决定结果。
- 保持未提供 `model` / `thought_level` 的 legacy raw `config` 路径与既有 warning-and-continue 行为；语义解析/设置失败、语义与 raw config 冲突或语义配置无法唯一确定时均阻止 prompt。
- 为歧义结果保留可续用的 prepared spawned Session，返回其 `sessionId`、未 dispatch 标记、问题原因和候选值；该状态不创建正式 running turn、不占用 active capacity、也不启动 inactivity watchdog。
- 重写 `prompt_to_agent` 总描述及 `model`、`thought_level`、`config` 字段描述，使父 Agent 无需探测即可理解首次调用、精确匹配、澄清、冲突与 continuation 规则。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `fyllo-spawn`: 扩展 `prompt_to_agent` 的输入、live config 解析、结构化配置澄清、prepared Session、结果状态与 Agent-facing 使用指导。

## Impact

- 共享 RPC/schema：`src/shared/types/fyllo-spawn-rpc.ts`。
- MCP tool 描述与注册：`src/mcp-servers/fyllo-spawn/src/tools/prompt-to-agent.ts` 及对应 MCP server 测试。
- Main 编排与配置解析：`src/main/services/session/spawn/spawned-session-manager.ts`、`src/main/services/session/chat/session-config-recovery-service.ts`，以及必要的纯 domain resolver/planner。
- Spawned Session 持久化与查询投影可能需要兼容 prepared/configuration-required 状态，但不改变已有消息、response、owner scope、并发、timeout 或 notification 契约。
- 测试：`test/main/services/session/spawn/**`、`test/main/services/session/chat/session-config-recovery-service.spec.ts`、`test/mcp-servers/fyllo-spawn/tools.spec.ts` 与 shared schema 测试。
- 不新增外部依赖，不把 session config options 加入 `available_agents` 或 initialize capability cache，不改变普通 Chat / draft probe 的配置控制行为。
