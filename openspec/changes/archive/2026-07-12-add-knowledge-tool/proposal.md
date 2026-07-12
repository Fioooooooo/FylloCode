## Why

FylloCode 当前没有 durable knowledge 机制。一次高成本排查、第三方文档消化或用户长期纠正如果没有进入 proposal、guidelines 或 lineage 的紧凑制品，后续会话只能重新阅读、重新推理，甚至把反直觉但必要的修复“清理”回去。

本变更将参考设计中的 knowledge tool 落成正式产品能力：让 agent 先以低成本 flag 候选，再由用户触发 capture/review，把不可廉价推断的事实写入项目级 app data knowledge base，并在后续会话中以索引方式注入。

## What Changes

- 新增项目级 knowledge base，存储在 app data 的 `projects/<encoded-project-path>/knowledge/*.md`，不进入仓库；每条 knowledge 使用 YAML frontmatter + markdown body。
- 新增 knowledge entry frontmatter contract，支持 `project`、`reference`、`feedback` 三类条目，以及 `file`、`package`、`url` anchors、`source`、`asOf`、`createdAt`、`updatedAt` 等元数据；其中 `package` anchor 使用 pnpm lockfile resolution entry 的 SHA-256 digest。
- 新增 anchor stale 计算：注入索引和 audit 时把条目计算为 `active | suspect | unknown`，其中 `suspect` 表示证据变化，`unknown` 表示证据无法验证。
- 新增 `fyllo-cortex` MCP `knowledge` tool，提供 `capture`、`update`、`retire`、`audit` 四个 mode；flag 不作为 tool mode。
- 新增 Chat system-reminder `<knowledge>` 块，注入紧凑索引、读取规则、冲突规则和 flag 触发测试。
- 扩展 Fyllo Action contract，新增 `knowledge.flag` 和 `knowledge.review` 两类 action，并为 action definition 增加 `presentation: inline | rail` 与 `interaction: passive | confirm` 维度；本变更中的 `knowledge.flag` 与 `knowledge.review` 均为 confirm action。
- 保持 renderer 侧 Fyllo Action 解析模型：EventRail 从当前 active session 已加载 assistant messages 中解析未处理 actions，并将 `knowledge.flag` 作为 rail action 展示。
- 新增 `knowledge.flag` capture 操作入口：用户在 inline ActionShell 确认某个 flag 时，`knowledge.flag` handler 通过 chat store 发送 capture 用户消息，覆盖当前已加载会话中的全部未处理 knowledge flags；该消息拆成隐藏 `<system-reminder>` text part 和用户可见 text part，EventRail 只展示和定位 pending flags，不提供 capture 操作按钮；发送成功后同批 pending flags 通过现有 Fyllo Action state 机制标记完成。
- 新增 `knowledge.review` 审阅流程，复用 plan review 的交互模型：agent 写入或更新磁盘 knowledge md 后输出 review action，用户确认 action 时打开 slideover 读取磁盘原文、可实时保存编辑，最终确认只写回 Fyllo Action state。
- 新增 `insight:knowledge:*` IPC/preload/renderer API 面，用于 review slideover 按 `name` 读取和保存 app data 中的 knowledge markdown 原文；保持 root domain taxonomy 不变，且 knowledge 与 lineage 作为 `insight` 下平级 area。
- 明确延后 archive 阶段起草集成、仓库晋升层、额外全局提醒和自动后台 capture。

## Capabilities

### New Capabilities

- `fyllo-cortex-knowledge`: 定义项目级 durable knowledge 的存储、entry contract、索引注入、flag/capture/review 流程、MCP tool modes、audit/update/retire 行为、安全边界和失败处理。

### Modified Capabilities

- `domain-architecture-contract`: 明确 knowledge review raw markdown 文档读写相关 IPC/preload/renderer wrapper 归属 `insight:knowledge` area，并继续遵守 domain-first channel 和 API 形状。

## Impact

- 受影响 shared contract：`src/shared/types/fyllo-action.ts`、`src/shared/types/knowledge.ts`、`src/shared/schemas/fyllo-action.ts`、`src/shared/schemas/knowledge.ts`、`src/shared/constants/fyllo-action-contracts.ts`、`src/shared/ipc/insight/knowledge.*`。
- 受影响 main：`src/main/services/session/chat/system-reminder/**`、新增 knowledge storage/scanner/raw markdown review 相关模块。
- 受影响 MCP server：`src/mcp-servers/fyllo-cortex/src/tools/**`、`src/mcp-servers/fyllo-cortex/src/utils/**`、`src/mcp-servers/fyllo-cortex/src/tools/instructions/knowledge/**`。
- 受影响 renderer：Fyllo action parsing/rendering/dispatch、knowledge review slideover、`ChatSessionEventRail`、`EventRailContent`、`src/renderer/src/api/insight/knowledge.ts`。
- 受影响 tests：main storage/system-reminder/ipc tests、MCP tool tests、shared schema tests、renderer EventRail/action tests、preload API tests。
- 不改变现有 task/proposal action 的 payload contract，不改变现有 session message JSONL 格式，不把 knowledge 写入仓库，不新增 root domain，不把 knowledge review 放入 lineage area。
