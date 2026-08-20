# Kimi Code CLI ACP tool-call analysis

## Capture metadata

- canonical `agentId`: `custom-kimi-a447f3c7`
- display name: `Kimi Code CLI`
- actual running version: `0.36.1`
- version source: ACP `initialize.agentInfo.version`
- underlying Agent version: `null`（不是 bridge）
- ACP SDK version: `1.3.0`
- capture scenario: 隔离临时工作区中的只读检查、搜索、创建文件、编辑文件和读取确认
- capture status: `completed`
- capture diagnostics: none

这是一次 existing integration optimization。Kimi 已通过 FylloCode 的 custom Agent 配置接入；本次只修复事件聚合层在 Kimi 参数流期间把累计 `content` 当作工具标题的问题，不新增 Kimi 专属身份或 host side effect。

## Raw event summary

Bundled capture runner 在单一 ACP 进程和 session 中收到 287 个 `session/update`：

| Update                      | Count |
| --------------------------- | ----: |
| `agent_message_chunk`       |   184 |
| `agent_thought_chunk`       |    25 |
| `available_commands_update` |     1 |
| `session_info_update`       |     1 |
| `tool_call`                 |     7 |
| `tool_call_update`          |    68 |
| `usage_update`              |     1 |

未发现未知 update type、孤儿 update、重复 start、终态后的 update 或 parent/subagent metadata。7 个工具调用均从 `pending` start 开始；6 个以 `completed` 结束，1 个 `Read` 调用因目标不存在以 `failed` 结束。

Kimi `0.36.1` 的工具生命周期具有以下稳定形状：

1. `tool_call` start 带有稳定的工具名、`kind` 和 `pending`，但不带 `rawInput`。
2. 参数生成期间发送多次 `tool_call_update`，`status` 为 `in_progress`，`title`/`kind` 为 `null`，`content` 是累计 JSON 参数文本片段，例如 `{`、`{"command": "ls -la"}`。
3. 工具真正执行前的后续 update 才补上结构化 `rawInput`、`kind` 和动作描述 title，例如 `Running: ls -la`。
4. 终态 update 省略 title/kind/rawInput；结果同时通过 text `content` 和字符串 `rawOutput` 返回。失败时 status 为 `failed`，错误文本同样位于 content/rawOutput。
5. `Read`、`Glob`、`Grep`、`Write`、`Edit` 的路径或搜索参数在后续 update 提供；文件工具的 locations 也在后续 update 提供。`Edit` update 额外携带 `type: diff` content block。

## Remaining-tool capture

在完成基础文件工具采样后，又使用同一个 Kimi ACP 进程和 session，对剩余高价值工具做了完整的独立 prompt 采样。采样计划显式覆盖 `Agent`、`AgentSwarm`、`WebSearch`、`FetchURL` 和 `Skill`；定时器、目标、计划、任务以及交互式询问仍按安全边界不执行。原始 capture 的状态为 `completed_with_errors`，但进程正常退出且所有六个 prompt 的 ACP 事件都已保存；前三个 prompt 的父阶段超时不等于对应 tool-call 没有终态。

### Capture summary

Bundled analyzer 对本次 capture 解析出 1083 个 `session/update`，包含 6 个 tool call；没有未知 update type、无效记录、孤儿 update、重复 start 或终态后 update。

| Update                      | Count |
| --------------------------- | ----: |
| `agent_message_chunk`       |   364 |
| `agent_thought_chunk`       |   252 |
| `available_commands_update` |     1 |
| `session_info_update`       |     1 |
| `tool_call`                 |     6 |
| `tool_call_update`          |   453 |
| `usage_update`              |     6 |

| Scenario                    | ACP tool status | Prompt phase result | 观察                                                                   |
| --------------------------- | --------------- | ------------------- | ---------------------------------------------------------------------- |
| `subagent-readonly-success` | `failed`        | timeout 180000 ms   | `Agent` 终态明确为 stopped-before-finished；父 prompt 被 runner cancel |
| `subagent-readonly-failure` | `failed`        | timeout 180000 ms   | `Agent` 终态明确为 stopped-before-finished；父 prompt 被 runner cancel |
| `agent-swarm-readonly`      | `completed`     | timeout 180000 ms   | `AgentSwarm` 终态文本报告两个子任务 `aborted`；父 prompt 随后超时      |
| `public-web-search`         | `completed`     | completed           | `WebSearch` 只发送 `rawInput.query`                                    |
| `public-fetch-url`          | `completed`     | completed           | `FetchURL` 只发送 `rawInput.url`                                       |
| `local-skill-load-only`     | `failed`        | completed           | `Skill` 返回 skill 不在当前 listing                                    |

前三个 prompt 触发了 3 次 Bash 权限请求，均选择 `allow_once`。这些权限请求属于子 Agent 内部执行，不是父 `Agent` tool-call 的 `parentToolCallId` 或 `_meta`；本次没有把它们错误归并为父子工具关系。

### Remaining tool shapes

五类工具都遵循与基础工具相同的 `pending → in_progress → terminal` 事件生命周期：start 提供工具名和 `kind`，参数流期间 `title`/`kind` 暂时为 `null`，结构化 update 再提供完整 `rawInput` 和动作标题，终态省略这些字段并通过 text content 与字符串 `rawOutput` 返回结果。

- `Agent` start title 为 `Agent`、kind 为 `other`；结构化 update title 为 `Launching explore agent: ...`，`rawInput` 包含 `prompt`、`description`、`subagent_type: "explore"`。没有 `parentToolCallId`、`_meta` 或子 Agent summary，因此不能仅凭 `subagent_type` 触发现有子 Agent inspector 语义。
- `AgentSwarm` start title 为 `AgentSwarm`、kind 为 `other`；结构化 update 额外包含 `prompt_template` 和 `items`。本次唯一终态为 ACP `completed`，但 output XML 报告两个子任务 `aborted`，所以父 tool status 与子任务结果必须分别保留。
- `WebSearch` start 和结构化 update 的 raw kind 都是 `fetch`；标题从 `WebSearch` 变为 `Searching: Kimi Code ACP official documentation`，结构化 `rawInput` 只有 `query`。
- `FetchURL` raw kind 是 `other`；标题变为带截断 URL 的 `Fetching: ...`，结构化 `rawInput` 只有 `url`。
- `Skill` raw kind 是 `other`；标题变为 `Invoke skill adapt-acp-events`，结构化 `rawInput` 只有 `skill`，终态为 `failed`，错误文本为 `Skill "adapt-acp-events" not found in the current skill listing.`。

本次 analyzer 报告的 6 个 tool call 均为单 start、无 parent metadata；前三个 tool call 的 `rawInput.subagent_type` 被识别为潜在 subagent metadata path，但并没有被 ACP 映射成结构化摘要。

## Version-scoped tool coverage ledger

| Raw tool identity                                         | Raw title variants                                | Inventory source                                           | Availability condition | Semantic family | Sample status         | Scenarios / observed shape                                                                            | Gap reason                                   |
| --------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- | ---------------------- | --------------- | --------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `Bash`                                                    | `Bash`; `Running: ls -la`                         | 本次 Kimi ACP raw capture；Fyllo read-only inventory probe | 默认工具集             | execute         | sampled               | pending → in_progress 参数片段 → structured input → completed；`rawInput.command`、字符串 `rawOutput` | none                                         |
| `Read`                                                    | `Read`; `Reading README.md`; `Reading sample.txt` | 本次 Kimi ACP raw capture                                  | 默认工具集             | read            | sampled               | 成功和失败各一次；`rawInput.path`、locations、completed/failed                                        | none                                         |
| `Glob`                                                    | `Glob`; `Searching **/*`                          | 本次 Kimi ACP raw capture                                  | 默认工具集             | read/search     | sampled               | `rawInput.pattern`、locations、completed                                                              | none                                         |
| `Grep`                                                    | `Grep`; `Searching for 'sample' in /workspace`    | 本次 Kimi ACP raw capture                                  | 默认工具集             | search          | sampled               | `rawInput.pattern`、locations、completed                                                              | none                                         |
| `Write`                                                   | `Write`; `Writing sample.txt`                     | 本次 Kimi ACP raw capture；Fyllo read-only inventory probe | 默认工具集             | edit/write      | sampled               | `rawInput.path/content`、locations、completed                                                         | 仅在隔离临时工作区写入                       |
| `Edit`                                                    | `Edit`; `Editing sample.txt`                      | 本次 Kimi ACP raw capture；Fyllo read-only inventory probe | 默认工具集             | edit            | sampled               | `rawInput.path/old_string/new_string`、diff content、locations、completed                             | 仅在隔离临时工作区修改                       |
| `Agent`                                                   | `Agent`; `Launching explore agent: ...`           | 本次 Kimi ACP remaining-tool raw capture                   | 子 Agent 调用          | subagent        | sampled               | pending → in_progress 参数片段 → structured input → failed；`rawInput.subagent_type` 仅作为输入保留   | 父 prompt 超时，但 ACP tool 终态已捕获       |
| `AgentSwarm`                                              | `AgentSwarm`; `Launching agent swarm: ...`        | 本次 Kimi ACP remaining-tool raw capture                   | 子 Agent swarm         | subagent        | sampled               | pending → in_progress 参数片段 → structured input → completed；output 报告两个子任务 aborted          | 父 prompt 超时；子任务结果另在 output 文本中 |
| `WebSearch`                                               | `WebSearch`; `Searching: ...`                     | 本次 Kimi ACP remaining-tool raw capture                   | 网络可用且需要联网     | `fetch`（raw）  | sampled               | pending → in_progress 参数片段 → structured query → completed；`rawInput.query`                       | canonical renderer kind 暂无 `fetch`，见下文 |
| `FetchURL`                                                | `FetchURL`; `Fetching: ...`                       | 本次 Kimi ACP remaining-tool raw capture                   | 网络可用且需要联网     | `other`（raw）  | sampled               | pending → in_progress 参数片段 → structured URL → completed；`rawInput.url`                           | ACP 未提供更具体 kind                        |
| `Skill`                                                   | `Skill`; `Invoke skill adapt-acp-events`          | 本次 Kimi ACP remaining-tool raw capture                   | 需要指定 skill         | `other`（raw）  | sampled               | pending → in_progress 参数片段 → structured skill → failed；错误文本和 rawOutput 同步返回             | Kimi runtime listing 不包含当前 skill        |
| `CronCreate` / `CronList` / `CronDelete`                  | 未观察                                            | Fyllo read-only inventory probe                            | 定时器能力             | other           | intentionally skipped | 会创建、读取或删除持久调度                                                                            | 不执行调度副作用                             |
| `TodoList`                                                | 未观察                                            | Fyllo read-only inventory probe                            | Agent session workflow | other           | intentionally skipped | 会改变会话任务状态                                                                                    | 不改变采样 session workflow                  |
| `EnterPlanMode` / `ExitPlanMode`                          | 未观察                                            | Fyllo read-only inventory probe                            | Agent mode workflow    | other           | intentionally skipped | 会改变 Agent 工作模式                                                                                 | 不改变采样 session mode                      |
| `CreateGoal` / `UpdateGoal` / `GetGoal` / `SetGoalBudget` | 未观察                                            | Fyllo read-only inventory probe                            | Fyllo goal workflow    | other           | intentionally skipped | 会创建、修改或读取目标状态                                                                            | 不触碰当前 Fyllo goal                        |
| `TaskList` / `TaskOutput` / `TaskStop`                    | 未观察                                            | Fyllo read-only inventory probe                            | 需要已有后台任务       | other           | unavailable           | 需要任务 ID 和后台任务                                                                                | 采样 session 没有授权任务                    |
| `AskUserQuestion`                                         | 未观察                                            | Fyllo read-only inventory probe                            | 需要交互式用户回答     | other           | intentionally skipped | 会阻塞采样并改变交互流程                                                                              | runner 只允许独立安全 prompt                 |
| `ReadMediaFile`                                           | 未观察                                            | Fyllo read-only inventory probe                            | 需要媒体附件           | unavailable     | 无可用媒体输入        | 隔离 workspace 没有媒体附件                                                                           | 环境不具备前置条件                           |

本次 `newSession` 返回的 available commands 也已记录，但它们是 slash-command workflow 而非已观察的 tool-call identity：`compact`、`status`、`usage`、`mcp`、`tasks`、`help`、`check-kimi-code-docs`、`custom-theme`、`import-from-cc-codex`、`mcp-config`、`sub-skill`、`sub-skill.consolidate`、`sub-skill.review`、`update-config`、`write-goal`。没有配置 MCP server，因此没有可采样的 MCP tool inventory。

## Adaptation decision

选择 `src/shared/chat/tool-call-assembly.ts` 的 shared pure assembly，而不是新增 Kimi adapter：

- 问题只依赖 ACP 公共字段和跨事件顺序：已有 title + 非终态 content-only update。
- Kimi 的参数流 content 是累计输入 JSON，不是用户可见工具标题；如果 start 已建立 title，后续参数片段必须保留该 title。
- 现有 orphan update 的 content fallback 仍需要保留，因此只有在 previous 没有既有 title 时才使用 content 作为非终态标题回退。
- Kimi 后续带有结构化 `title` 的 update 仍可提供更具体的动作描述；本次不猜测或改写其语义。
- `Agent` / `AgentSwarm` 的 `rawInput.subagent_type` 不是 ACP 的父子关系或结构化 summary；按照 `subagent-call-inspector` 规范，非 Claude adapter 不从 title 或输入文本推断子 Agent 语义，因此继续使用普通工具事件。
- `WebSearch` 的 raw `kind: "fetch"` 被基线 mapper 保留；当前 Renderer 的 canonical `ToolKind` 没有 `fetch`，所以其 icon lookup 会回退到 `other`。这是真实的可见语义差异，但是否把 WebSearch 归入 `search` 需要产品契约决定，本次不擅自改动。
- `FetchURL` 与 `Skill` 都只有 raw `kind: "other"`，没有足够公共字段支持更窄的 canonical kind；Skill 的 `failed` 终态和错误文本已经由基线保留。
- 不修改 mapper schema、SessionEvent、持久化字段、IPC 或 Renderer-only state。

## Fixture and focused test

- 最小 fixture：`test/main/services/session/chat/acp-mapper/fixtures/custom-kimi-a447f3c7/0.36.1-argument-stream-title-stability.json`
- 剩余工具 fixture：`test/main/services/session/chat/acp-mapper/fixtures/custom-kimi-a447f3c7/0.36.1-remaining-tool-shapes.json`
- 回放测试：`test/main/services/session/chat/acp-mapper/kimi.spec.ts`
- 共享规则测试：`test/shared/chat/tool-call-assembly.spec.ts`
- Main `MessageAssembler` 使用共享 pure assembly；Renderer 继续复用同一 `reduceToolCallPart`，并由现有 Renderer assembler suite 覆盖共同持久化字段。

Fixture 只保留每类工具的最短 `pending → 参数片段 → structured title/input → terminal` 序列；完整 capture 在 fixture 回放和脱敏检查完成后删除。

## Unsupported or unresolved shapes

- 本次仍未观察 orphan tool update、`parentToolCallId`、ACP `_meta` 中的 subagent summary、plan、config option、MCP tool、媒体输入或未知 update type；`Agent` / `AgentSwarm` 的子任务结果仅作为 raw output 文本出现。
- `Read`、`Glob`、`Grep`、`Write`、`Edit` 已有真实覆盖，但没有把它们全部复制到永久 fixture；它们的 raw title、字段和跳过原因保留在本台账中。
- Kimi 的 `WebSearch` / `FetchURL` / `Skill` 已完成真实采样；`fetch` canonical kind 缺口、`FetchURL` 的 `other` 语义和 `Skill` runtime listing 不可用仍是待产品决策或后续 adapter 设计的问题，不在本次证据固化中猜测。
- `agentVersion` 只代表 Kimi ACP `initialize.agentInfo.version`；没有可证明的 underlying Agent/bridge version。
