## Context

ACP 流式链路当前有两层数据表示：

- `SessionEvent`（`src/main/domain/chat/session-events.ts`）：主进程内部表达 ACP 语义事件，判别字段为 `type`。
- `MessageChunkData`（`src/shared/types/ipc.ts`）：跨 MessagePort 发往渲染进程的 UI chunk，判别字段为 `kind`。

`session-event-mapper.ts` 的 `toMessageChunk` 负责前者到后者的转换。经核验，两个联合类型是**交叉关系**而非包含关系：

| 变体                                                                                                                                                                             | SessionEvent            | MessageChunkData            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------- |
| text_delta / reasoning_delta / tool_call_start / tool_call_update / usage_update / session_info_update / available_commands_update / plan_update / config_options_update（9 个） | ✅                      | ✅                          |
| done / error / session_id_resolved                                                                                                                                               | ✅（控制流，main-only） | ❌                          |
| user_message / status                                                                                                                                                            | ❌                      | ✅（渲染态，renderer-only） |

9 个同构变体仅字段名不同（`type`↔`kind`，`tool_call_start.kind`↔`tool_call_start.toolKind`），`toMessageChunk` 因此是逐字段抄写 + 两处 `JSON.parse(JSON.stringify())` 深拷贝。

工具调用侧，`acp-mapper.ts` 当前把字段提取位置写死：`tool_call` 分支仅读 `title`/`kind`，`tool_call_update` 分支仅读 `status`/`content`/`rawInput`（不读 `rawOutput`、不读 `content[].type === "diff"`）。而 ACP 协议（`references/acp/tool-call-trace/ACP-Tool-Call-Document.md:109`）规定 tool call 字段除 `toolCallId`/`title` 外全部可选、且不规定出现时机。五个样本 agent 的 trace（`references/acp/tool-call-trace/agent-tool-call-analysis/`）证实了字段时机的多样性。

下游有两个 assembler 各自维护工具卡片 part：主进程 `message-assembler.ts`（持久化）与渲染进程 `useUIMessageAssembler.ts`（实时展示）。二者对 `tool_call_update` 找不到对应 part 时均直接丢弃（`message-assembler.ts:81`、`useUIMessageAssembler.ts:76`）。

## Goals / Non-Goals

**Goals:**

- 消除 `SessionEvent` 与 `MessageChunkData` 中 9 个同构变体的重复定义，使流式内容字段单点定义、单点演进。
- 把 `toMessageChunk` 从逐字段抄写降为"子集透传 + 控制流过滤"。
- 让 acp-mapper 按 ACP 协议做字段位置无关的工具调用提取，对未观测过的 agent 也能正确建卡。
- 保持 acp-mapper 为无状态纯函数。
- 用统一 schema 一次性承载工具调用的 `input`/`diff` 等字段，避免 main/renderer 两侧重复加字段。

**Non-Goals:**

- 不实现 sub-agent 嵌套展示（claude `parentToolUseId`、qodercli `call_function_*`、codex `codex exec` NDJSON、opencode task XML）。本期仅在 schema 预留 `parentToolCallId` 字段位，UI 不消费。
- 不实现 terminal 协议（`type: "terminal"` content）的实际渲染，仅预留字段。
- 不实现 `locations`（跟随 agent 文件定位）的 UI 功能，仅预留透传。
- 不改变 `done`/`error`/`session_id_resolved` 的控制流处理逻辑。

## Decisions

### 决策 1：共享子集 + 各端外挂，而非整体合并

**选择**：新建 `src/shared/types/stream-event.ts`，定义 `StreamContentEvent`（9 个跨进程同构变体，判别字段统一为 `kind`）。`SessionEvent = StreamContentEvent | done | error | session_id_resolved`；`MessageChunkData = StreamContentEvent | user_message | status`。

**理由**：两个类型是交叉关系。若把 `SessionEvent` 整体搬到 shared 当 IPC 类型，`session_id_resolved` 这类纯主进程内部事件会污染渲染进程的 exhaustive switch；反之渲染态 `user_message`/`status` 也不应进入主进程。抽取公共子集既消重又保持各端边界清晰。

**备选**：(a) 让 `MessageChunkData = SessionEvent` 直接复用——被否，会泄漏 main-only 控制流变体到渲染进程。(b) 维持现状两套定义——被否，正是要消除的重复。

### 决策 2：判别字段统一为 `kind`，工具类别字段统一为 `toolKind`

**选择**：共享子集以 `kind` 作判别字段（与现有 `MessageChunkData` 一致），`tool_call_start` 的工具类别字段用 `toolKind`（现 `SessionEvent` 用 `kind` 同时作判别和类别，存在语义重载）。`SessionEvent` 侧改名 `type`→`kind`。

**理由**：`MessageChunkData` 已用 `kind`，改动 `SessionEvent` 一侧即可对齐；`SessionEvent.tool_call_start` 当前 `kind` 字段既非判别字段又叫 `kind`，与外层判别字段同名易混，统一为 `toolKind` 消除歧义。

**影响**：`acp-mapper.ts`、`message-assembler.ts`、`acp-session-recovery.ts`（`firstObservedEventType`、`shouldSuppressDuringReplay`）、`acp-session.ts`、`chat.ts` 的 switch 全部 `ev.type`→`ev.kind`。纯机械改名。

### 决策 3：字段位置无关提取（吸收原"缺口 1/2/3"为一条原则）

**选择**：抽取共享提取函数，`tool_call` 与 `tool_call_update` 两个分支都调用同一套逻辑提取 `input`（`rawInput` 归一）、`content`（text 块拼合）、`diff`（`content[]` 中 `type === "diff"` 项）。`tool_call_start` 与 `tool_call_update` 事件均带可选 `input`/`diff`。

**理由**：原规划列的"缺口 1（gemini 无 start）/缺口 2（codex/qodercli start 带 rawInput）/缺口 3（codex start 带 diff）"本质是同一件事——字段出现在哪个事件不确定。逐个打补丁等于对协议的时机不确定性做穷举，新 agent 换个时机组合又会冒出新"缺口"。按"位置无关"原则做一次，未知 agent 自动覆盖，符合"按 ACP 规范尽可能兼容"的目标。

**备选**：原规划的 5 缺口并列方案——被否，理由如上。

### 决策 4：孤儿 update 在 assembler 层 lazy-upsert，mapper 保持无状态

**选择**：mapper 不追踪"哪些 toolCallId 已 start"。当 `tool_call_update` 到达而 assembler 中无对应 part 时，由 assembler 用 update 自带的 `toolCallId`/`title`/`toolKind` 惰性创建一个 part（`state: "input-available"`），再应用更新。两个 assembler（`message-assembler.ts:81`、`useUIMessageAssembler.ts:76`）的 `idx === -1` 分支都从"return 丢弃"改为"创建后继续"。

**理由**：assembler 本就是工具卡片 part 的唯一权威存储，孤儿补偿放在这里最内聚，且天然幂等。原规划为此把 mapper 升级为有状态类（`toolCallStarted` Map + `resetSession` 生命周期 + 返回值变 `SessionEvent[]` + 向后兼容导出），改动面横跨 mapper/session-events/acp-session 三个文件，且其向后兼容导出存在取数组最后一项会丢弃合成 start 的 bug、模块级单例跨 session 共享状态的内存与 ID 碰撞风险。无状态 + assembler 补偿可完全规避这些。

**备选**：mapper 有状态类（原规划方案）——被否，过度设计且有已识别缺陷。

### 决策 5：completed+error 降级与 MCP 归一明确隔离为"agent 怪癖补丁"

**选择**：两者实现为 acp-mapper 中独立、带注释标注的小函数，不混入通用提取逻辑：

- `resolveStatus`：`status === "completed"` 且 `rawOutput.error` 为非空字符串时返回 `failed`，content 取 error 文本。
- MCP 标识识别：优先用 `rawInput` 结构 `{ server, tool, arguments }`（codex 形态）判定，而非解析 title 字符串。

**理由**：这两项无法从 ACP 规范推导，只能靠观察样本得到，天然只对见过的 agent 生效，属启发式纠偏。与协议派生的通用原则（决策 3）隔离，将来好加好删，且不会让其伪装成通用能力。原规划缺口 5 的"最后一个 `_`→`/`"规则建立在错误前提上（差异矩阵误记 gemini MCP title，实际为 `"guidelines (fyllo-skills MCP Server)"`），本期需先修正矩阵事实再实现。

### 决策 6：为 ACP 扩展字段预留可选字段位

**选择**：`StreamContentEvent` 的 tool_call 变体预留 `locations?`、`parentToolCallId?` 等可选字段，content 提取保留对未来 `terminal` 类型的识别钩子（暂返回占位或忽略）。本期不强制 UI 消费。

**理由**：目标是兼容任意符合 ACP 的 agent。预留字段位使未来启用"跟随文件定位""sub-agent 嵌套""terminal 渲染"时无需再改跨进程契约。

## Risks / Trade-offs

- [判别字段大范围改名引入编译错误] → TypeScript 的 exhaustive switch（现有代码已有 `never` 兜底，见 `chat.ts:460`、`useUIMessageAssembler.ts:169`）会在编译期暴露所有遗漏点；以 `pnpm typecheck` 为准逐一修复。
- [lazy-upsert 可能为协议噪声创建多余卡片] → 仅当 `tool_call_update` 携带合法 `toolCallId` 时创建；ACP 规定 `toolCallId` 在 update 中必填，噪声风险低。
- [completed+error 降级误伤正常 completed] → 仅当 `rawOutput.error` 为非空字符串才降级；正常成功响应无此字段。以 qodercli Grep trace 为测试基准。
- [MCP 结构识别覆盖不全] → 不同 agent 的 MCP rawInput 形态不一（codex 有 `{server,tool}`，opencode/qodercli 无）。识别失败时回退原 title，不阻断主流程；本期仅保证 codex 形态归一，其余按 fallback 处理并在测试中固化预期。
- [预留字段增加 schema 表面积] → 全部为可选字段，不影响现有消费方；以注释标注"预留，本期不消费"。

## Migration Plan

无数据迁移、无持久化格式变更。`SessionEvent`/`MessageChunkData` 均为运行时内存类型，不落盘（assembler 产出的 `UIMessage` 才落盘，其结构不变）。

部署即生效，回滚为代码回退。建议实现顺序：先做类型统一（决策 1/2，零行为变化）并通过 typecheck + 既有测试绿，再叠加兼容逻辑（决策 3/4/5/6），使每一步可独立验证。

## Open Questions

- 暂无阻塞性问题。MCP 归一的非 codex 形态（gemini 的 `"x (y MCP Server)"`、opencode 的 `x_y`）是否本期也归一，已决定：本期仅保证 codex 形态，其余 fallback，留待后续按需扩展（已在决策 5 与 Risks 中固化）。
