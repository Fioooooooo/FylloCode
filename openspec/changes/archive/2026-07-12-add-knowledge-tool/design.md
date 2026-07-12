## Context

当前 FylloCode 已有三套相邻机制，但都不能替代 knowledge：

- `guidelines/**/*.md` 是仓库内工程规范，适合记录项目约定；不适合记录用户长期反馈、第三方文档消化或高成本推理缓存。
- lineage 可以追溯任务、会话、proposal 和 commit，但它通常是指针，不是压缩后的因果模型；直接修复或长会话里形成的结构性事实仍可能不可发现。
- 现有 Fyllo Action 只有 `task.create` 和 `plan.create`，缺少 rail action 形态，无法把低成本候选提示放进 EventRail。

已有代码落点：

- system reminder 的 Chat provider 位于 `src/main/services/session/chat/system-reminder/providers/chat.ts`，当前拼接模板、`<guidelines>`、Fyllo Action contract。
- guidelines scanner 由 `src/mcp-servers/fyllo-cortex/src/utils/scan-guidelines.ts` 提供，并由 main 通过 `src/main/infra/guidelines/scan-guidelines.ts` 复用。
- bundled MCP server 通过 `src/main/infra/mcp/bundled-mcp-servers.ts` 注入 `FYLLO_PROJECT_PATH` 和 `FYLLO_PROJECT_DATA_DIR`。
- assistant messages 在 chat stream 的 `driveAcpStream` hook 中通过 `appendMessage(projectPath, sessionId, message)` 持久化。
- EventRail 当前通过 `src/renderer/src/utils/fyllo-action-rail.ts` 扫描 active session 的 assistant text parts，并排除已有 `actionStates`。

## Goals / Non-Goals

**Goals:**

- 建立项目级 app data knowledge base，所有 worktree/window 共享，避免知识随分支或 worktree 丢失。
- 通过 `knowledge.flag` 实现低成本发现，通过 `knowledge.review` 实现用户审阅写入。
- 保持当前 renderer 侧 Fyllo Action 扫描模型，让 EventRail 展示当前 active session 已加载消息中的未处理 `knowledge.flag` actions。
- 提供 `fyllo-cortex` `knowledge` tool，负责返回 authoring instructions、当前 knowledge state 和 `knowledgeRoot`，具体撰写与落盘由 agent 完成。
- 在 Chat system-reminder 注入 `<knowledge>` 索引和 flag 规则，让 agent 能先读现有条目、识别可沉淀候选，并避免 knowledge 覆盖更高权威。
- 以 `active | suspect | unknown` 区分 anchor 状态，避免把“证据变了”和“无法验证”混为一谈。

**Non-Goals:**

- 不在 v1 中把 knowledge 晋升为仓库文件；晋升为 guideline 或仓库 knowledge 属后续显式流程。
- 不在 v1 中集成 Archive 阶段起草；Apply/Archive UX 优化完成后再决定草稿存储形态。
- 不做后台 LLM capture、自动整理或静默 token 消耗；capture 必须由用户触发。
- 不新增 root domain；knowledge review 文档读取和保存归入既有 `insight` domain 下独立 `knowledge` area，不能放入 lineage area。
- 不把 `knowledge.flag` 做成 MCP tool call；flag 必须是 assistant message 中的 Fyllo Action。

## Decisions

### 1. 存储放在 app data 项目目录，而不是仓库

Knowledge entry 存在 `FYLLO_PROJECT_DATA_DIR/knowledge/<name>.md`。main 侧路径由 `projectDir(projectPath)` 派生，MCP 侧通过现有 `FYLLO_PROJECT_DATA_DIR` 环境变量读取。

选择 app data 的原因：

- worktree 共享：同一项目的 linked worktree 和 main workspace 立即可见，不需要等待合并。
- 避免 PR 噪音：knowledge 是高频会话副产物，不应混入功能 PR。
- 避免虚假权威：guidelines 是团队规范，knowledge 是记录和证据；二者权威不同。

替代方案是仓库内 `knowledge/`，它便于版本化，但会引入 review 噪音和分支可见性问题，因此 v1 不采用。

### 2. Entry contract 使用 YAML frontmatter + markdown body

每个 entry 文件必须包含结构化 frontmatter：

- `name`：kebab-case 唯一标识，同时作为文件名。
- `description`：hook line，说明“何时应该打开此条目”。
- `type`：`project | reference | feedback`。
- `createdAt` / `updatedAt`。
- `asOf`：写入时 Git HEAD，仅作 provenance，可缺省。
- `anchors`：`file`、`package`、`url` 三种证据锚点；`package` anchor 记录 pnpm lockfile resolution entry 的稳定 SHA-256 digest，而不是 registry integrity 字符串片段。
- `source`：无锚点条目的出处；feedback 必须记录用户原话位置。

Body 记录事实、原因、复用场景、会使其失效的条件。Capture/update/retire 时 agent 根据 tool instruction 和 state 直接写入或更新完整 markdown 文件；review UI 不解析或重组 frontmatter，而是读取和保存磁盘中的 markdown 原文。

### 3. 索引是派生结果，不维护手写索引文件

新增 scanner 递归读取 `knowledge/*.md` 的 frontmatter，构建紧凑 index。注入时动态计算 anchor status：

- `active`：所有可验证锚点仍匹配。
- `suspect`：可验证锚点发生变化，如 file SHA-256 不同、package `resolutionDigest` 不同、url freshness 超窗。
- `unknown`：锚点无法验证，如文件不可读、lockfile 缺失、url metadata 无法解析。

不维护 `index.json` 或 `MEMORY.md` 式手写索引，避免双写漂移。派生索引也能包含动态 status，这是手写索引无法可靠维护的字段。

### 4. `knowledge.flag` 是 rail + confirm action，不是 tool mode

Agent 在发现候选时输出：

```xml
<fyllo-action type="knowledge.flag">
{"summary":"...","contextPaths":["src/..."]}
</fyllo-action>
```

`summary` 必须一句话说明候选事实以及为什么不可廉价推断；`contextPaths` 可选，用于后续 capture 用户消息给 agent 提供上下文路径。`knowledge.flag` 不直接写 knowledge 文件，也不写 session meta；它是 assistant message 中的 rail + confirm action，确认后触发 capture 用户消息，取消只记录该 action state。

EventRail 继续使用 renderer 侧的现有模型扫描 active session 已加载 assistant text parts，并排除已有 `actionStates` 的 actions。`knowledge.flag` 作为 `presentation=rail`、`interaction=confirm` 的 action 被纳入同一解析/展示路径。

### 5. `knowledge.review` 复用 plan review 模型，payload 指向磁盘 entry

Capture、update、retire、audit 最终都由 agent 先写入或更新 `knowledge/<name>.md`，再输出一张 `knowledge.review` action 给用户审阅。Payload 顶层只携带 `name` 和可选 `summary`，用于定位要打开的磁盘 entry；它不传完整 markdown，也不传 capture/update/retire 操作列表。

用户确认 action 时，renderer handler 像 `plan.create` 一样打开 knowledge review slideover。Slideover 通过 `insight:knowledge:readEntry` 读取 `knowledge/<name>.md` 的完整原文，在编辑器中直接显示 frontmatter + body；用户编辑时通过 `insight:knowledge:saveEntry` 实时保存完整 markdown 原文。点击 slideover 确认只关闭 slideover 并让现有 Fyllo Action 机制把该 action state 写回 session meta；main 不在 confirm 阶段执行 capture/update/retire operation。

Knowledge review 需要独立 `insight:knowledge` IPC/preload/renderer wrapper，与 `insight:lineage` 平级；不得把 knowledge 文档读写塞进 lineage。

### 6. Capture 由用户通过 ActionShell 触发

EventRail 从 active session 已加载 assistant messages 中解析未处理 `knowledge.flag` actions，并只负责展示和定位这些 pending actions，不提供 capture、confirm 或沉淀按钮。用户在 inline ActionShell 确认某个 flag 时，`knowledge.flag` handler 对当前已加载会话中的全部未处理 knowledge flags 组装 capture 用户消息，chat store 只提供 `chatStatus` 和 `sendMessage` 发送能力。发送必须遵守当前 Chat prompt 的发送条件：assistant 正在回复时不得发送，handler 应在发送前检查 `chatStatus`，不可发送时返回 failed。

当 capture 用户消息发送成功时，`knowledge.flag` handler 返回同批 pending flag 的 action ids，ActionShell 在完成被点击 action state 的同时复用现有 Fyllo Action state 写入机制把这些 action ids 一并标记为 `succeeded`。这只是现有 action state 的批量完成，不引入 `knowledge.flag` 的 main-side 投影或额外 session meta 字段。

Capture 用户消息必须拆成两个 text parts：

- 第一个 text part 是完整 `<system-reminder>...</system-reminder>`，对用户不可见，用于提示 agent 先调用 `mcp__fyllo_cortex__knowledge({ "mode": "capture" })` 获取 capture instruction，并携带候选 `summary` 与 `contextPaths`。该 hidden part 不包含 `actionId`，也不复制 knowledge 文件写入细节；具体写入和 review 流程以 tool 返回的 instruction 为准。
- 第二个 text part 是用户可见的自然语言请求，例如“请把刚才标记的 2 条可沉淀内容整理为项目知识，并在完成后让我审阅。”不得暴露 FylloCode 内部术语、tool 名、payload 或 action id。

Agent 收到该消息后调用 `mcp__fyllo_cortex__knowledge({ mode: "capture" })`。Tool 返回当前 index 和 capture instruction；候选清单不从 tool 输入传递，而在用户消息里。

### 7. `fyllo-cortex` tool 只提供 state 和 instructions

新增 `knowledge` tool schema：

- `mode`: `capture | update | retire | audit`。
- `name`: update/retire 必填。
- `reason`: update/retire 必填。
- `includeInstruction`: 默认 true。

Tool 不负责 LLM 判断，也不替代 review UI。它扫描 `knowledge/` 构造 state，按 mode 返回 instruction 和 `knowledgeRoot`；agent 根据这些信息直接创建、更新或删除 app data 中的 knowledge markdown 文件，然后输出 `knowledge.review` action 指向需要用户审阅的 entry：

- capture：查重、准入测试、验证、撰写 entry、写入文件、发 review。
- update：验证目标条目、决定 repair/retire、更新文件、发 review。
- retire：确认废弃证据、删除或更新文件后发 review。
- audit：批量检查 suspect/unknown、重复和 description 质量，必要时更新文件并发 review。

### 8. Chat system-reminder 注入 `<knowledge>`

在 `resolveChatSystemReminder` 中拼接 `knowledgeSection`，顺序为：chat template、guidelines section、knowledge section、Fyllo Action contract。Archive reminder 不注入 knowledge v1；Apply reminder 不输出 action contract，v1 不把 capture/review 流程放进 Apply。

`<knowledge>` 只注入紧凑 index 行：`type` 分组、`name`、`description`、status marker。它不注入 anchors/source 等审计字段；agent 需要细节时直接读取 `{knowledgeRoot}/<name>.md`。所有用户可写字段必须转义 `<` 和 `>`，防止关闭 reminder 或 action 标签。

### 9. 安全边界以“记录和证据”建模

Knowledge 不升级为 live instruction。`feedback` 是用户过去长期指令的记录；用户当前显式指令优先，但临时偏离不等于撤销。Knowledge 与 guidelines 或 OpenSpec spec 冲突时，agent 必须报告冲突，不得静默以 knowledge 覆盖更高权威。

Capture/update 必须拒绝 token、凭据、密钥和个人敏感信息。Reference 条目只记录事实性结论，剥离外部文档中的指令性文本，避免 prompt injection 被持久化。

## Risks / Trade-offs

- **过度捕获导致 EventRail 噪音** → `knowledge.flag` 门槛刻意偏低，但 capture instruction 的五条 admission tests 和用户 review 会淘汰多数候选；后续通过 capture 淘汰率观察松紧。
- **索引变大增加 system reminder token** → v1 注入 hook line 而非全文；当 rendered index 超过阈值时追加“建议 audit 整理”提示。真正控制点是 admission strictness。
- **package anchor 实现复杂** → v1 仅支持 pnpm lockfile package entry 的稳定 SHA-256 `resolutionDigest`；无法解析时标记 `unknown`，不得假装 active。
- **review 编辑器保存损坏 frontmatter** → slideover 按原文保存，不预处理 frontmatter；scanner 负责把损坏条目标为 parse error 或跳过，避免 UI 擅自修正用户原文。
- **用户误以为确认会再次落盘** → 编辑器实时保存是唯一写入点；确认只写 Fyllo Action state。需要修改 knowledge 时，用户继续通过对话让 agent 调整并输出新的 review。

## Migration Plan

- 初始版本没有旧 knowledge 数据需要迁移；缺失 `knowledge/` 目录视为空 index。
- 本变更不新增 session meta 字段；旧 session meta 和 message JSONL 正常加载。
- 如果单条 knowledge 文件 frontmatter 损坏，scanner 返回该条 parse error 或跳过该条，不阻断整个 reminder 注入。
- 回滚时可移除 `<knowledge>` 注入和 tool/action contract；app data 中的 `knowledge/*.md` 保留但不被读取。
