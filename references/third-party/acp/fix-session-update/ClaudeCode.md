# Claude Code (claude-acp) session update 修复方案

> 本文记录 Claude Code ACP（agent id `claude-acp`）当前工具调用事件形态及 FylloCode 的阶段性适配方案。延续 `Codex.md` 的按 agent 单独适配思路，`references/third-party/acp/` 仅供后续统一 Proposal 取材，不是行为契约。

## 目标与边界

本次只处理 agent id 为 `claude-acp`（及潜在别名 `claude`）的 session update，聚焦工具调用展示友好度：

- 归一 MCP 工具的稳定名称与人类可读标题，消除 `mcp__server__tool` 原始串直接进入 UI 的问题；
- 把子代理（Agent 工具）内嵌工具调用的 `_meta.claudeCode.parentToolUseId` 解析为 `parentToolCallId`，并透传至渲染层数据结构，为后续嵌套展示预置数据链路；
- 复核并保留原生工具（Bash / Read / Write / Edit / Glob / Grep）已由 `_meta.claudeCode.toolName` 归一的既有行为。

明确不在本期范围（原因见下）：

- **子 Agent 嵌套的 UI 展示**（缩进 / 分组 / 折叠卡片）：本期只把 `parentToolCallId` 数据送达渲染层，渲染层维持平铺展示；子 Agent 卡片由**后续单独 Proposal** 完成，届时数据链路已就位，只需实现 UI。
- **文件编辑/删除的 title 合成**：Claude Code 的 Write/Edit title 本身已是 `Write <path>` / `Edit <path>` 具体形态，无需 Codex 式 `codexEditTitle` 合成；Claude Code 无原生 Delete/Move 工具，删除走 Bash `rm`，正常显示为命令。此为 Codex 与 Claude 的真实差异，非遗漏。
- **`toolResponse` 结构化富信息**：分两类——(A) 与标准 `content`/`rawOutput` 冗余的（Glob `filenames`/`numFiles`、Read 行数、Grep `content`、Bash `stdout`），UI 已能显示，不做；(B) 标准事件缺失、仅存于 `toolResponse` 的 Agent 子代理统计（`totalTokens`/`totalDurationMs`/`toolStats`），其**展示**依附子 Agent 卡片，随嵌套 UI 一并归入后续单独 Proposal。
- 跨 agent 统一 adapter 架构、有状态 mapper（孤儿补偿 / 去重）：保持现状不动。
- 其他 agent（codex / gemini / qodercli / opencode）现有映射和展示：完全不变。

## 日志证据

证据来源：`references/third-party/acp/tool-call-trace/agent-tool-call-logs/claude-acp.txt`、同目录 `agent-tool-call-analysis/claude-acp.md`，以及本次针对 MCP 工具触发 tavily 后的开发日志 `data/logs/main.log`。

### 原生工具（现状已可用）

Claude Code 原生工具在 `_meta.claudeCode.toolName` 提供稳定名称，start 事件 `title` 为泛化词（`Terminal` / `Read File` / `Find`），第一次 `in_progress` update 才带上具体命令/路径作为 `title` 与 `rawInput`：

```json
{
  "_meta": { "claudeCode": { "toolName": "Bash" } },
  "content": [{ "content": { "text": "列出目录内容", "type": "text" }, "type": "content" }],
  "kind": "execute",
  "rawInput": { "command": "ls ...", "description": "列出目录内容" },
  "title": "ls ...",
  "toolCallId": "tooluse_...",
  "sessionUpdate": "tool_call_update"
}
```

当前 mapper 已在 `tool_call` 分支用 `_meta.claudeCode.toolName` 归一 `toolName`，`tool_call_update` 分支透传 `title`/`input`/`content`，此路径工作正常，本期只做回归保护，不改逻辑。

### MCP 工具（核心缺口）

本次触发 tavily 后的 `data/logs/main.log` 证据，start 事件：

```json
{
  "_meta": { "claudeCode": { "toolName": "mcp__tavily__tavily_search" } },
  "content": [],
  "kind": "other",
  "rawInput": {},
  "status": "pending",
  "title": "mcp__tavily__tavily_search",
  "toolCallId": "toolu_bdrk_...",
  "sessionUpdate": "tool_call"
}
```

第一次 `in_progress` update 带 `rawInput`，但 `title` 仍是原始串：

```json
{
  "_meta": { "claudeCode": { "toolName": "mcp__tavily__tavily_search" } },
  "kind": "other",
  "rawInput": { "query": "...", "max_results": 3 },
  "title": "mcp__tavily__tavily_search",
  "toolCallId": "toolu_bdrk_...",
  "sessionUpdate": "tool_call_update"
}
```

要点：

- Claude Code 的 MCP 工具 `_meta.claudeCode.toolName` 与 `title` 都是 `mcp__<server>__<tool>` 双下划线格式，**不是** `acp-mapper-refactor-plan.md` 假设的 `server/tool` 标准格式；
- `kind` 恒为 `other`，无结构化 `rawInput.{server,tool}`，因此 Codex 形态的 `normalizeMcpTool`（靠 `rawInput.server/tool`）识别不到，`mcp__tavily__tavily_search` 原样进入 `toolName` 与 UI 文案；
- 完成阶段会先发一条仅含 `_meta.claudeCode.toolResponse`（此处为 JSON 字符串）的 update，随后再发标准 `content[]` + `rawOutput` + `status: "completed"`。前者当前被映射成无内容的 `in_progress`，与后者冗余。

### 子代理内嵌工具（parentToolUseId）

`agent-tool-call-analysis/claude-acp.md` 记录：Agent 工具启动子代理后，子代理内部工具调用的 `_meta.claudeCode.parentToolUseId` 指向父 Agent 的 `toolCallId`：

```json
{
  "_meta": {
    "claudeCode": { "toolName": "Read", "parentToolUseId": "tooluse_ZZh1LLv3jokPPukzlpcDYB" }
  },
  "kind": "read",
  "status": "pending",
  "title": "Read tool-call-trace/test-write.txt",
  "toolCallId": "tooluse_NgKl7Hu74yofC7pyVcfNZt",
  "sessionUpdate": "tool_call"
}
```

`stream-event.ts` 的 `tool_call_start` 已预留 `parentToolCallId` 字段，但当前 mapper 从不读取该 `_meta`，子工具与顶层工具平铺，无法在 UI 表达"某工具属于某子代理"。

## 当前缺口

### 1. MCP 工具身份未归一，UI 直显 `mcp__server__tool`

`toolName` 与展示文案都落到 `mcp__tavily__tavily_search`。稳定身份不适合做图标/分组/参数规则，人类可读性也差。

### 2. MCP 工具无友好 title

`title` 与 `toolName` 同为原始串，`DynamicToolUIPart.title` 无有意义值，卡片主文案只能显示丑陋标识。

### 3. 子代理 parentToolUseId 被丢弃

mapper 从不读取 `_meta.claudeCode.parentToolUseId`，嵌套关系数据未透传，`parentToolCallId` 字段空置。本期补齐**数据链路**（解析并透传到渲染层）；UI 嵌套展示留待后续单独 Proposal。

### 4. toolResponse-only 中间事件冗余（低优先，本期不做）

仅含 `_meta.claudeCode.toolResponse` 的 update 产生一条空 `in_progress`。当前无害（仅冗余渲染），本期不处理。

## 映射规则

### claude-acp 识别

延续 Codex 做法，由 `AcpSession` 显式把 `agentId` 传入 mapper。新增 `CLAUDE_AGENT_IDS`（`claude-acp`，预留 `claude`）集合与 `isClaudeAgent(context)` 判定，仅对该集合启用本页规则，避免靠 title/toolCallId 猜测。

### MCP 工具名称与标题

新增位置无关辅助 `normalizeClaudeMcpTool(name)`：

- 输入形如 `mcp__<server>__<tool>` 时，剥离 `mcp__` 前缀，把 server 与 tool 之间的 `__` 归一为 `/`，得到 `server/tool`（如 `mcp__tavily__tavily_search` → `tavily/tavily_search`），与 Codex MCP 归一结果对齐；
- 不匹配该格式时原样返回；
- 该函数纯字符串处理，不依赖 `rawInput` 结构。

在 `tool_call` / `tool_call_update` 的 claude 分支：

- `toolName` = `normalizeClaudeMcpTool(_meta.claudeCode.toolName ?? title)`（原生工具 `toolName` 不含 `mcp__`，函数原样返回，行为不变）；
- `title`：若 `_meta.claudeCode.toolName` 或原始 title 命中 `mcp__` 格式，用 `Call server/tool` 作为可读标题；否则保留 ACP 原始 title（原生工具的具体命令/路径不受影响）。

### 子代理 parentToolCallId

在 claude 分支读取 `_meta.claudeCode.parentToolUseId`，为字符串时写入 `tool_call_start.parentToolCallId`。为覆盖缺 start 的场景，同步在 `tool_call_update` 事件与 `stream-event.ts` 的 `tool_call_update` 变体补充可选 `parentToolCallId`。非 claude agent 不读取该扩展。

### 非 claude agent

`isClaudeAgent` 为假时，`toolName` / `title` / `parentToolCallId` 全部保持现状，Codex 及其他 agent 路径零改动。

## UI 规则

- 工具主文案沿用既有 `title ?? toolName`：MCP 工具显示 `Call server/tool`，原生工具显示具体命令/路径；
- 图标、分组、参数规则继续使用 `toolKind` / `toolName`，归一后的 `server/tool` 命中 `other` 图标（MCP 工具 `kind` 恒为 `other`）；
- 子代理工具**本期维持平铺展示**：`parentToolCallId` 数据透传到渲染层但不消费，assembler 与组件默认忽略该字段，现有渲染零变化。嵌套 UI（缩进 / 分组 / 折叠卡片）由后续单独 Proposal 实现。

## 后续单独 Proposal（本期不做，仅记录）

以下均依赖子 Agent 卡片 UI，数据形态需与 UI 一并设计，留待后续 Proposal：

- 子 Agent 嵌套展示：基于本期已就位的 `parentToolCallId`，把子代理工具收进父 Agent 卡片（缩进 / 分组 / 折叠）；
- Agent 子代理统计展示：消费 `toolResponse` 的 `totalTokens`/`totalDurationMs`/`totalToolUseCount`/`toolStats`，在父 Agent 卡片显示"读了 N 个文件 / 耗时 / token"等；
- toolResponse-only 中间事件去重。

不纳入后续 Proposal（确认不做）：与标准 `content`/`rawOutput` 冗余的 A 类 `toolResponse` 字段（Glob `filenames`/`numFiles`、Read 行数、Grep `content`、Bash `stdout`）。

## 预计修改点

- `src/main/services/session/chat/acp-mapper.ts`：新增 `CLAUDE_AGENT_IDS` / `isClaudeAgent` / `normalizeClaudeMcpTool`，在 tool_call 两分支接入 claude 规则与 `parentToolUseId` 透传；
- `src/shared/types/stream-event.ts`：`tool_call_update` 变体补充可选 `parentToolCallId`；
- `src/main/domain/session/chat/message-assembler.ts` 与 `src/renderer/src/composables/useUIMessageAssembler.ts`：透传 `parentToolCallId`（默认不改变现有渲染）；
- 对应 `test/main/**` 与 `test/renderer/**` 测试。

## 验收场景

1. claude-acp MCP 工具 `mcp__tavily__tavily_search` 得到 `toolName: "tavily/tavily_search"` 与 `title: "Call tavily/tavily_search"`。
2. claude-acp 原生工具（Bash/Read/Write/Edit/Glob/Grep）稳定 `toolName` 与具体命令/路径 title 保持不变。
3. claude-acp 子代理内嵌工具的 `parentToolUseId` 进入事件 `parentToolCallId`，且默认渲染不受影响。
4. 缺 start 的孤儿 update 仍能建卡，claude 规则不破坏既有孤儿补偿。
5. 非 claude agent（codex 等）的 title/toolName/parentToolCallId 与 content/孤儿 update 行为完全不变。
6. `normalizeClaudeMcpTool` 对非 `mcp__` 输入原样返回，对多段 tool 名（含额外 `__`）按首个 `__` 归一 server 边界的规则稳定可预期。
