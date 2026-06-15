# acp-mapper tool_call 兼容性重构方案

> 基于 5 个 agent 日志（claude-acp / codex-acp / gemini / qodercli / opencode）及 ACP v1 官方文档

---

## 背景

FylloCode 通过 `acp-mapper.ts` 把 ACP `sessionUpdate` 事件转换为内部 `SessionEvent`。当前实现是无状态纯函数，在面对不同 agent 的行为差异时存在兼容缺口。

ACP 协议对 tool_call 字段的定义几乎全部是可选的——除 `toolCallId` 和 `title` 以外，`status / kind / rawInput / rawOutput / content / locations` 均为可选，且协议没有规定各字段出现的时机。这意味着各 agent 的差异行为都是协议合法的，client 必须自己做兼容。

---

## 跨 agent 差异矩阵

| 差异点            | claude-acp                         | codex-acp                   | gemini                           | qodercli                                                   | opencode                    |
| ----------------- | ---------------------------------- | --------------------------- | -------------------------------- | ---------------------------------------------------------- | --------------------------- |
| start 时的 status | `pending`                          | `in_progress`               | 有时**缺失 start**               | `in_progress`                                              | `pending`                   |
| rawInput 揭示时机 | 第一次 in_progress update          | **start 时已有**            | 第一次 update                    | **start 时已有**                                           | 第一次 in_progress update   |
| diff 内容位置     | completed update 的 content        | **start 时就在 content**    | 无 diff                          | completed update 的 content                                | completed update 的 content |
| toolCallId 格式   | `tooluse_<id>`                     | `call_<uuid>`               | `<tool>__<id>`                   | `toolu_bdrk_<id>`（子代理内为 `call_function_<id>_<seq>`） | `call_<seq>_<random>`       |
| MCP tool title    | `_meta.claudeCode.toolName`        | `"Tool: server/tool"`       | `"<tool> (<server> MCP Server)"` | 无特殊                                                     | `"server_tool"`（下划线）   |
| MCP tool rawInput | `_meta.claudeCode` 内              | `{server, tool, arguments}` | 无 rawInput                      | 无 rawInput                                                | 直接为参数                  |
| sub-agent 信号    | `_meta.claudeCode.parentToolUseId` | bash 命令含 `codex exec`    | `invoke_agent` tool              | toolCallId 含 `call_function_`                             | `kind:"think"` + task XML   |
| error 表达        | `status:"failed"`                  | `status:"failed"`           | `status:"failed"`                | **`status:"completed"` + rawOutput.error**                 | `status:"failed"`           |
| 重复 update       | 否                                 | 否                          | 否                               | **completed 重复推送**                                     | in_progress 多次            |

---

## 当前代码的五个兼容缺口

### 缺口 1：gemini 跳过 tool_call start，直接发 tool_call_update

gemini 的部分工具（如 `list_directory`、`glob`、`replace`）不发 `tool_call` start 事件，直接发来 `tool_call_update`。  
当前 mapper 不追踪状态，无法感知这个情况，导致 UI 层收到一个没有对应 start 的 update，工具卡片无法正确创建。

### 缺口 2：codex/qodercli 在 start 时已携带 rawInput，但当前未读取

当前 `tool_call` 分支只读取 `title` 和 `kind`，忽略了 `rawInput`。  
对 codex/qodercli 而言，input 信息在 start 时就可展示，但目前要等到第一次 update 才能看到。

### 缺口 3：codex edit 在 start 时已携带 diff，当前未读取

codex 的 edit 类工具把 diff（`content[].type === "diff"`）放在 `tool_call` start 事件的 `content` 字段里。  
当前 `tool_call` 分支完全不读 `content`，diff 数据被丢弃。

### 缺口 4：qodercli 用 completed + rawOutput.error 表达错误

qodercli 的 Grep 等工具在执行失败时，发出 `status: "completed"` 但 `rawOutput` 中包含 `error` 字段。  
当前 mapper 直接透传 status，UI 层会把这条错误当作"成功完成"处理。

### 缺口 5：MCP tool title 格式不统一

不同 agent 的 MCP tool 标题格式各异，UI 无法统一识别和展示：

- codex-acp：`"Tool: fyllo-cortex/guidelines"`
- opencode：`"fyllo-specs_explore"`（下划线分隔 server 和 tool）
- gemini/claude：`"fyllo-cortex/guidelines"`（已经是标准格式）

---

## 方案设计

### 一、AcpMapper 从无状态函数升级为有状态类

需要跨事件状态来实现孤儿补偿和去重：

```ts
export class AcpMapper {
  // 记录已发出 start 的 toolCallId，用于孤儿补偿（缺口 1）
  private readonly toolCallStarted = new Map<string, boolean>();

  // 记录已发出终态（completed/failed）的 toolCallId，用于去重（缺口 4 附带效果）
  private readonly toolCallTerminated = new Set<string>();

  mapSessionUpdate(update: SessionUpdate): SessionEvent | SessionEvent[] | null { ... }

  // ACP session 结束时调用，释放内存
  resetSession(): void {
    this.toolCallStarted.clear();
    this.toolCallTerminated.clear();
  }
}
```

`mapSessionUpdate` 返回值从 `SessionEvent | null` 扩展为 `SessionEvent | SessionEvent[] | null`，  
用于孤儿补偿时同时返回合成的 start + 真实 update。

### 二、五个缺口的具体处理

#### 缺口 1：孤儿 update 补偿

```
tool_call_update 到来时：
  if (toolCallId 不在 toolCallStarted 中):
    合成一个 tool_call_start 事件（用 update 里现有的 title/kind）
    标记该 toolCallId 为 started
    return [syntheticStart, updateEvent]
```

#### 缺口 2：start 时前置 rawInput

```
tool_call 事件处理时：
  if (update.rawInput != null):
    将 rawInput 写入 tool_call_start.input
```

#### 缺口 3：start 时提取 diff

```
tool_call 事件处理时：
  从 update.content[] 中提取 type === "diff" 的项
  写入 tool_call_start.diff
```

#### 缺口 4：completed + rawOutput.error → failed

```
tool_call_update 处理时：
  if (status === "completed" && rawOutput?.error 是字符串):
    status = "failed"
    content = rawOutput.error
```

同时对终态去重：同一 toolCallId 的 completed/failed 只透传第一次。

#### 缺口 5：MCP title 规范化

统一为 `server/tool` 格式：

```
"Tool: fyllo-cortex/guidelines"  →  "fyllo-cortex/guidelines"   (strip "Tool: " prefix)
"fyllo-specs_explore"            →  "fyllo-specs/explore"        (last _ → /)
"fyllo-cortex/guidelines"        →  不变
```

规则按优先级依次尝试，最后 fallback 原样返回。

### 三、新增辅助函数

```ts
// 从 content[] 提取 diff 项
function extractDiffs(content: unknown): ToolCallDiff[] | undefined;

// 从 content[] 提取纯文本（type==="content" 的项）
function extractTextContent(content: unknown): string | undefined;

// MCP title 规范化
function normalizeMcpTitle(title: string, rawInput: unknown): string;

// status 解析（含 qodercli completed-but-error 降级）
function resolveStatus(status: string, rawOutput: unknown): "in_progress" | "completed" | "failed";
```

### 四、向后兼容导出

保留现有的自由函数导出，但孤儿补偿在数组返回时只取最后一项，不破坏现有调用方：

```ts
// 用于未迁移的调用方，行为与旧版接近
const _defaultMapper = new AcpMapper();
export function mapSessionUpdate(update: SessionUpdate): SessionEvent | null {
  const result = _defaultMapper.mapSessionUpdate(update);
  if (Array.isArray(result)) return result[result.length - 1] ?? null;
  return result;
}
```

新调用方应实例化 `AcpMapper`，每个 ACP session 对应一个实例。

---

## SessionEvent 类型变更

### 新增共享类型

```ts
export type ToolCallDiff = {
  path: string;
  newText: string;
  oldText?: string; // undefined = 新建文件（对应 ACP 文档的 null for new files）
};
```

### tool_call_start 新增三个可选字段

```ts
{
  type: "tool_call_start";
  toolCallId: string;
  title: string;
  kind: string;
  input?: Record<string, unknown>;    // 新增：start 时已有 rawInput（codex/qodercli）
  diff?: ToolCallDiff[];              // 新增：start 时已有 diff（codex edit）
  parentToolCallId?: string;          // 新增：sub-agent 嵌套（claude parentToolUseId）
}
```

### tool_call_update 新增一个可选字段

```ts
{
  type: "tool_call_update";
  toolCallId: string;
  status: "in_progress" | "completed" | "failed";
  input?: Record<string, unknown>;
  content?: string;
  diff?: ToolCallDiff[];              // 新增：从 content[].type==="diff" 提取
}
```

---

## acp-session.ts 调用侧变更

`AcpSession` 需要持有 `AcpMapper` 实例，并在 session 结束时重置：

```ts
// 构造函数中
private readonly mapper = new AcpMapper();

// cleanupSessionHandler 中
this.mapper.resetSession();

// runPrompt 中的 sessionHandler（原来）
const event = mapSessionUpdate(notification.update);
if (!event) return;
this.emit("event", event);

// 改为
const result = this.mapper.mapSessionUpdate(notification.update);
if (!result) return;
const events = Array.isArray(result) ? result : [result];
for (const event of events) {
  if (args.runtimeState.firstObservedEventType === null) {
    args.runtimeState.firstObservedEventType = event.type;
    logger.info(`${this.logPrefix(args.sessionId)} observed first session event: ${event.type}`);
  }
  if (args.runtimeState.suppressReplay && shouldSuppressDuringReplay(event)) {
    args.runtimeState.suppressedReplayEvents += 1;
    continue;
  }
  this.emit("event", event);
}
```

---

## 变更文件清单

| 文件                                     | 变更内容                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/main/domain/chat/session-events.ts` | 新增 `ToolCallDiff` 类型；`tool_call_start` 加 `input/diff/parentToolCallId`；`tool_call_update` 加 `diff` |
| `src/main/services/chat/acp-mapper.ts`   | 新增 `AcpMapper` 类；新增四个辅助函数；保留 backward-compat 自由函数导出                                   |
| `src/main/services/chat/acp-session.ts`  | 持有 `AcpMapper` 实例；sessionHandler 处理数组返回值；cleanupSessionHandler 调用 resetSession              |

---

## 未纳入本次方案的内容

以下内容观察到但暂不处理，可按需追加：

- **sub-agent 嵌套展示**：qodercli `call_function_*` 格式、opencode `kind:"think"` task XML、codex `codex exec` bash 输出内嵌 NDJSON——这些需要 UI 层配合设计，mapper 层暂不特殊处理
- **locations 字段透传**：`tool_call` 和 `tool_call_update` 的 `locations[]` 当前未透传，可在需要"跟随 agent 文件定位"功能时补充
- **terminal content 类型**：ACP content 支持 `type:"terminal"` 嵌入终端输出，当前过滤掉了，可在支持 terminal 协议后补充
- **重复 in_progress update 去重**：opencode 会多次推送相同 status 的 in_progress，当前无害（只是冗余渲染），暂不处理

---

## 优先级建议

| 优先级 | 缺口                               | 理由                                        |
| ------ | ---------------------------------- | ------------------------------------------- |
| P0     | 孤儿 update 补偿（缺口 1）         | gemini 受影响，工具卡片无法创建             |
| P0     | completed-but-error 降级（缺口 4） | qodercli 错误被误判为成功，用户体验严重受损 |
| P1     | diff 字段统一提取（缺口 3）        | 影响所有 agent 的 edit 类工具展示           |
| P1     | start 时前置 rawInput（缺口 2）    | 提升 codex/qodercli 的 input 显示时机       |
| P2     | MCP title 规范化（缺口 5）         | 纯展示问题，无功能影响                      |
