# Codex session update 修复方案

> 本文记录 Codex ACP 当前事件形态及 FylloCode 的阶段性适配方案。`references/third-party/acp/` 仅供后续统一 Proposal 取材，不是行为契约。

## 目标与边界

本次只处理 agent id 为 `codex` 或 `codex-acp` 的 session update：

- 清理 Codex `agent_thought_chunk` 的摘要格式；
- 正确区分工具稳定名称与 ACP 人类可读标题；
- 根据 Codex 文件 diff 的结构化字段生成具体、可读的文件操作标题；
- 消费 Codex terminal `_meta` 中的增量输出和退出信息；
- 同时兼容旧版 Codex ACP 的标准 `content` / `rawOutput` 形态；
- 保持其他 agent 的现有映射和展示不变。

本次不处理 `agent_message_chunk._meta.codex.phase` 的 commentary / final_answer 分流，也不建立跨 agent 的统一 adapter 架构。待其他 agent 适配完成后，再根据 `references/third-party/acp/fix-session-update/` 下的文档统一形成 Proposal。

## 日志证据

### 思考摘要

当前 Codex 通常连续发送：

```json
{"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"\n\n"}}
{"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"**Planning proactive exploration and diagnostics**"}}
```

`UChatReasoning` 以纯文本渲染 `text`，不会解析 Markdown。因此当前 UI 会保留前导空行和字面量 `**`。

### Terminal 工具

启动事件：

```json
{
  "sessionUpdate": "tool_call",
  "toolCallId": "exec-...",
  "kind": "execute",
  "title": "Search for 'pattern' in main.log",
  "rawInput": {
    "command": "rg ...",
    "cwd": "/project"
  },
  "_meta": {
    "terminal_info": {
      "terminal_id": "exec-...",
      "cwd": "/project"
    }
  }
}
```

增量输出只放在扩展字段：

```json
{
  "sessionUpdate": "tool_call_update",
  "toolCallId": "exec-...",
  "_meta": {
    "terminal_output_delta": {
      "terminal_id": "exec-...",
      "data": "output chunk"
    }
  }
}
```

退出事件：

```json
{
  "sessionUpdate": "tool_call_update",
  "toolCallId": "exec-...",
  "status": "completed",
  "rawOutput": {
    "formatted_output": "full output",
    "exit_code": 0
  },
  "_meta": {
    "terminal_exit": {
      "terminal_id": "exec-...",
      "exit_code": 0,
      "signal": null
    }
  }
}
```

旧版 `codex-acp` 日志则可能没有 terminal `_meta`，而是在终态 `content[].content.text` 或 `rawOutput.stdout` / `formatted_output` 中提供结果。

### MCP 工具

Codex MCP start 事件仍在 `rawInput` 中提供结构化的 server/tool 身份，但新版 ACP title 已从旧格式 `Tool: server/tool` 变化为点分格式：

```json
{
  "sessionUpdate": "tool_call",
  "toolCallId": "call_...",
  "kind": "execute",
  "status": "in_progress",
  "title": "mcp.fyllo-specs.explore",
  "rawInput": {
    "server": "fyllo-specs",
    "tool": "explore",
    "arguments": {
      "targetPath": "/project",
      "includeInstruction": true
    }
  },
  "_meta": { "is_mcp_tool_call": true }
}
```

点分 title 不能可靠表达 server/tool 边界，且与旧格式不兼容；`rawInput.{server,tool}` 才是两个版本都具备的稳定结构化来源。

### 文件编辑工具

重启开发应用后，使用同一个 `tmp.txt` 分别执行新建、修改和删除，确认当前 Codex ACP 的文件工具没有 `rawInput`，而是在 start 事件的标准 `content[].type === "diff"` 块中携带文件信息。

新建文件：

```json
{
  "sessionUpdate": "tool_call",
  "toolCallId": "exec-...",
  "kind": "edit",
  "status": "in_progress",
  "title": "Editing files",
  "content": [
    {
      "type": "diff",
      "path": "/project/tmp.txt",
      "oldText": null,
      "newText": "initial content\n",
      "_meta": { "kind": "add" }
    }
  ]
}
```

修改文件：

```json
{
  "sessionUpdate": "tool_call",
  "toolCallId": "exec-...",
  "kind": "edit",
  "status": "in_progress",
  "title": "Editing files",
  "content": [
    {
      "type": "diff",
      "path": "/project/tmp.txt",
      "oldText": "initial content\n",
      "newText": "edited content\n",
      "_meta": { "kind": "update" }
    }
  ]
}
```

删除文件使用同一事件形态，其中 `newText` 为空字符串，操作类型为：

```json
{
  "type": "diff",
  "path": "/project/tmp.txt",
  "oldText": "edited content\n",
  "newText": "",
  "_meta": { "kind": "delete" }
}
```

三种操作的终态都只有 `status: "completed"` 和 `toolCallId`，没有重复发送 diff、输出内容或补充 `_meta`。当前 Codex mapper 重启验证后已能生成稳定的 `toolName: "Edit"`，但若 title 原样透传，UI 仍只能显示泛化的 `Editing files`。

## 当前缺口

### 1. 思考文本未规范化

`acp-mapper.ts` 原样把 Codex thought text 映射为 `reasoning_delta`，导致空白 chunk 和 `**summary**` 原样进入纯文本 reasoning UI。

### 2. title 与 toolName 语义混用

ACP `ToolCall.title` 是人类可读描述；AI SDK `DynamicToolUIPart.toolName` 是稳定工具身份，另有独立的可选 `title` 字段。

当前链路却是：

```text
ACP title → SessionEvent.title → DynamicToolUIPart.toolName
```

结果是：

- Codex 的整条命令或搜索描述被当成工具名称；
- `DynamicToolUIPart.title` 没有设置；
- `tool_call_update.title` 不能更新已有工具卡片；
- UI 无法用稳定名称处理图标、参数和分组，同时保留友好描述。

### 3. start input 在 assembler 中丢失

mapper 已提取 `rawInput`，但 renderer 与 main assembler 创建工具 part 时仍写死 `input: {}`。Codex 通常只在 start 携带 input，因此命令、cwd 和其他参数无法用于展示或持久化。

### 4. terminal `_meta` 输出被丢弃

`terminal_output_delta` 更新没有标准 `content` 或 `status`。当前 mapper 会生成一个无内容的 `in_progress` update；`terminal_exit` 的 `rawOutput.formatted_output` 也不会进入工具输出。

### 5. 文件编辑 title 缺少操作和文件名

Codex 文件工具的 ACP title 固定为 `Editing files`，真正的操作类型和文件路径分别位于 `content[]._meta.kind` 与 `content[].path`。仅透传原始 title 虽然符合协议字段语义，但无法告诉用户本次是在创建还是修改哪个文件。

### 6. MCP title 格式随 Codex ACP 版本变化

Codex MCP 的旧 title 为 `Tool: server/tool`，新 title 为 `mcp.server.tool`。当前仅把结构化身份写入 `toolName`，而 UI 主文案优先显示 title，因此新版事件最终暴露了不统一的 `mcp.server.tool`。

## 映射规则

### Codex 识别

由 `AcpSession` 将 `agentId` 显式传给 mapper。仅 `codex` 与 `codex-acp` 启用本页规则，避免依赖 title 或 toolCallId 的脆弱猜测。

### 思考文本

- 纯空白 chunk 返回 `null`；
- 完整匹配单层 `**summary**` 的 chunk 去除包裹并补一个换行；
- 其他非空文本原样透传；
- 非 Codex agent 保持当前行为。

### 工具名称与标题

内部 tool event 同时携带：

- `toolName`：稳定身份；
- `title`：人类可读描述。

Codex native tool 根据 `kind` 归一：

| ACP kind  | toolName |
| --------- | -------- |
| `read`    | `Read`   |
| `write`   | `Write`  |
| `edit`    | `Edit`   |
| `search`  | `Search` |
| `execute` | `Bash`   |
| 其他      | `Tool`   |

Codex MCP tool 根据结构化 `rawInput.{server,tool}` 归一为 `server/tool`：稳定身份写入 `toolName`，人类可读标题写为 `Call server/tool`。不得解析旧版 `Tool: ...` 或新版 `mcp....` title 字符串；结构化字段存在时直接覆盖 ACP 原始 title，使两个版本在前端统一展示。非 MCP 工具除下述文件编辑特例外，`title` 仍保留 ACP 原始人类可读值；update 自带的新 title 应更新已有卡片。

非 Codex agent 暂时让 `toolName` 回退为现有归一化 title，以保持展示不变。

### 文件编辑标题

只对 Codex `kind: "edit"` 的 start 事件读取结构化 diff 元数据，不解析 `oldText` / `newText` 文本内容：

- 单个 `_meta.kind: "add"`：`Create <basename>`；
- 单个 `_meta.kind: "update"`：`Edit <basename>`；
- 单个 `_meta.kind: "delete"`：`Delete <basename>`；
- 多个且全部为 `add`：`Create N files`；
- 多个且全部为 `update`：`Edit N files`；
- 多个且全部为 `delete`：`Delete N files`；
- 多文件操作类型混合：`Change N files`；
- 缺失可识别的 diff、path 或操作类型：回退 ACP 原始 title。

生成 title 时只取 `path` 的 basename，避免绝对路径让工具卡过长；完整路径和文本变更仍保留在 `diff` 中。该规则不改变稳定身份：`toolName` 仍为 `Edit`，`toolKind` 仍为 `edit`。非 Codex agent 不读取该 `_meta` 扩展。

### Terminal 输出

共享 tool update 增加可选 `outputDelta`：

- `_meta.terminal_output_delta.data` → `outputDelta`；
- delta 只追加工具输出，不改变 title、toolName 或 input；
- renderer 在工具仍为进行中时展示累计输出；
- main assembler 同步累计，确保终态消息可持久化；
- 终态优先使用标准 `content`，其次使用 `rawOutput.formatted_output`、`aggregated_output`、`stdout` / `stderr`；
- 若终态有完整输出，则替换累计 delta，避免重复；若没有，则使用已累计的 delta；
- `_meta.terminal_exit.exit_code !== 0` 且标准 status 缺失时映射为 `failed`。

## UI 规则

- 工具主文案显示 `title ?? toolName`；
- 图标、分组和参数规则继续使用 `toolKind` / `toolName`；
- Codex MCP 工具的主文案固定显示 `Call server/tool`，不暴露 ACP 版本相关 title；
- `Bash` 的 command、文件路径等参数来自保留下来的 start input；
- Codex 文件工具直接显示 mapper 从结构化 diff 生成的 `Create/Edit/Delete <filename>` title；
- streaming terminal output 作为工具正文显示，不得写入 title；
- terminal 完成后以完整输出替换临时累计输出。

## 预计修改点

- `src/main/services/session/chat/acp-session.ts`
- `src/main/services/session/chat/acp-mapper.ts`
- `src/shared/types/stream-event.ts`
- `src/main/domain/session/chat/message-assembler.ts`
- `src/renderer/src/composables/useUIMessageAssembler.ts`
- `src/renderer/src/utils/chatTool.ts`
- 对应 `test/main/**` 与 `test/renderer/**` 测试

## 验收场景

1. Codex 空白 thought 不创建 reasoning part。
2. `**Planning changes**` 显示为 `Planning changes`，且连续摘要之间有换行。
3. Codex search 工具得到稳定 `toolName: "Search"`，同时保留 ACP title。
4. Codex MCP 工具无论收到旧版 `Tool: server/tool` 还是新版 `mcp.server.tool`，都得到 `toolName: "server/tool"` 与 `title: "Call server/tool"`。
5. start 阶段的 command/cwd 进入 renderer 与持久化消息。
6. 多个 `terminal_output_delta` 按顺序追加并在进行中可见，且不覆盖标题。
7. terminal 终态使用完整输出替换累计 delta，不产生重复文本。
8. 无完整终态输出时保留累计 delta。
9. terminal 非零 exit code 在缺失标准 status 时映射为 failed。
10. 非 Codex mapper 调用保持既有 title、input、content 与孤儿 update 行为。
11. Codex 单文件 add/update/delete 分别显示 `Create <filename>` / `Edit <filename>` / `Delete <filename>`。
12. Codex 多文件同类或混合操作生成数量标题，无法可靠识别时回退 ACP 原始 title。
