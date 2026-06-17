# 支持自定义 ACP Agent

## Why

目前 FylloCode 的 Agent 来源仅限于 ACP Registry，用户无法像 Zed/IntelliJ 那样通过本地配置添加自定义 Agent（例如 Kimi Code CLI）。为了支持更灵活的 Agent 接入方式，FylloCode 需要引入本地自定义 Agent 配置机制，并让它在发现、选择、启动、对话全链路与 Registry Agent 等价。

## What Changes

- 新增本地配置文件 `data/acp/custom-agents.json`，格式与 Zed 的 `agent_servers` 保持一致（无 `type` 字段）。
- 引入 Agent Catalog Service，在主进程层统一 Registry Domain 与 Custom Domain，向上层返回带 `source: "registry" | "custom"` 标识的统一 Agent 视图。
- 改造 Agent 状态检测、进程启动、能力获取等主进程路径，使 custom agent 无需 ACP Registry entry 也能被发现和启动。
- 改造渲染进程 Agent store，让 `installedAgentIds`、状态缓存、图标回显等统一消费合并后的 Agent 列表。
- 在 `SettingsAgents` 页面新增"自定义" tab，使用 `stream-monaco` 提供 JSON 编辑器、字段说明与保存按钮。
- 改造 `ChatEmptyAgentPicker` 与 `AgentPickerModal`，使 empty 状态的已安装 Agent 展示和 more 弹窗均支持 custom agents。
- 改造 `StageCard` 等 workflow 相关 Agent 选择入口，使其能从合并后的已安装列表中选择 custom agent。

## Capabilities

### New Capabilities

- `custom-acp-agent`: 用户通过本地 JSON 配置自定义 ACP Agent，并与 Registry Agent 在发现、选择、启动、对话链路中并列使用。

### Modified Capabilities

- `agent-install`: Agent 安装状态检测需要把 custom agents 纳入检测范围，并正确返回其 `installed` 状态。
- `agent-status-cache`: 批量化状态检测、本地缓存与 `acp:statusUpdated` 广播需要包含 custom agents。
- `agent-status-panel`: Settings 页面的 Agents tab 需要新增"自定义"子 tab 以管理 `custom-agents.json`。
- `chat-agent-selection`: Chat 空态的 AgentPickerModal 需要新增 Registry/Custom tab，empty 状态的已安装展示需要混合 custom agents。
- `acp-agent-runtime-spawn`: ACP Agent 进程启动路径需要支持仅通过 `command/args/env` 启动的 custom agent。
- `acp-prompt-capabilities`: Prompt capabilities 的缓存与查询需要支持没有 `installedVersion` 的 custom agent。

## Impact

- 主进程：`detector.ts`、`acp-agent-service.ts`、`acp-process-pool.ts`、新增 Agent Catalog Service。
- 渲染进程：`useAcpAgentsStore`、`SettingsAgents.vue`、`AgentPickerModal.vue`、`ChatEmptyAgentPicker.vue`、`StageCard.vue`。
- 共享类型：`src/shared/types/acp-agent.ts`。
- 新增数据文件：`data/acp/custom-agents.json`。
- 无外部依赖变更；复用已集成的 `stream-monaco` 作为 JSON 编辑器。
