# gemini Tool Call 原始协议

Agent: `gemini`  
ACP Session: `80df0ad6-ea4a-4916-925d-f323c4ff3230`

> Gemini CLI 的特点：
>
> - tool_call 事件在 start 时 status 直接为 `in_progress`（无 pending 过渡）
> - tool_call_update completed 不携带独立的 `input` 字段（rawInput 在 start 中已携带）
> - 有独立的 `agent_thought_chunk` 推理流事件
> - 部分 tool 没有 tool_call_start 事件（直接在 tool_call_update 中出现）
> - toolCallId 格式为 `<toolname>__<随机id>`（如 `glob__gkwkchs4`）

---

## update_topic（上下文主题管理）

### tool_call_start（in_progress 直接启动）

```json
{
  "content": [],
  "kind": "think",
  "locations": [],
  "status": "in_progress",
  "title": "Update topic to: \"Tool Call Event Stream Tracing\"",
  "toolCallId": "update_topic__rdndj975",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "update_topic__rdndj975",
  "title": "Update topic to: \"Tool Call Event Stream Tracing\"",
  "kind": "think"
}
```

### tool_call_update（completed，内容在 content 中）

```json
{
  "content": [
    {
      "content": {
        "text": "## 📂 Topic: **Tool Call Event Stream Tracing**\n\n**Summary:**\nStarting the process of executing various tools...",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "think",
  "locations": [],
  "status": "completed",
  "title": "Update topic to: \"Tool Call Event Stream Tracing\"",
  "toolCallId": "update_topic__rdndj975",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "update_topic__rdndj975",
  "status": "completed",
  "content": "## 📂 Topic: **Tool Call Event Stream Tracing**\n\n**Summary:**\nStarting the process of executing various tools..."
}
```

---

## list_directory（目录列举）

### tool_call_start（in_progress 直接启动）

```json
{
  "content": [],
  "kind": "search",
  "locations": [],
  "status": "in_progress",
  "title": "tool-call-trace",
  "toolCallId": "list_directory__c9xmlh2j",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "list_directory__c9xmlh2j",
  "title": "tool-call-trace",
  "kind": "search"
}
```

### tool_call_update（completed，无 content）

```json
{
  "content": [],
  "kind": "search",
  "locations": [],
  "status": "completed",
  "title": "tool-call-trace",
  "toolCallId": "list_directory__c9xmlh2j",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{ "type": "tool_call_update", "toolCallId": "list_directory__c9xmlh2j", "status": "completed" }
```

---

## glob（文件模式搜索）

### tool_call_start

```json
{
  "content": [],
  "kind": "search",
  "locations": [],
  "status": "in_progress",
  "title": "'tool-call-trace/*.txt'",
  "toolCallId": "glob__gkwkchs4",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "glob__gkwkchs4",
  "title": "'tool-call-trace/*.txt'",
  "kind": "search"
}
```

### tool_call_update（completed，content 携带摘要文本）

```json
{
  "content": [
    { "content": { "text": "Found 2 matching file(s)", "type": "text" }, "type": "content" }
  ],
  "kind": "search",
  "locations": [],
  "status": "completed",
  "title": "'tool-call-trace/*.txt'",
  "toolCallId": "glob__gkwkchs4",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "glob__gkwkchs4",
  "status": "completed",
  "content": "Found 2 matching file(s)"
}
```

---

## grep_search（内容搜索）

### tool_call_start

```json
{
  "content": [],
  "kind": "search",
  "locations": [],
  "status": "in_progress",
  "title": "'.*' within tool-call-trace",
  "toolCallId": "grep_search__lmy3x7v5",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "grep_search__lmy3x7v5",
  "title": "'.*' within tool-call-trace",
  "kind": "search"
}
```

### tool_call_update（completed，无 content）

```json
{
  "content": [],
  "kind": "search",
  "locations": [],
  "status": "completed",
  "title": "'.*' within tool-call-trace",
  "toolCallId": "grep_search__lmy3x7v5",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{ "type": "tool_call_update", "toolCallId": "grep_search__lmy3x7v5", "status": "completed" }
```

---

## read_file（文件读取）

### tool_call_start（locations 在 start 中已填充）

```json
{
  "content": [],
  "kind": "read",
  "locations": [
    { "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt" }
  ],
  "status": "in_progress",
  "title": "tool-call-trace/test-write.txt",
  "toolCallId": "read_file__khfvqay1",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "read_file__khfvqay1",
  "title": "tool-call-trace/test-write.txt",
  "kind": "read"
}
```

### tool_call_update（completed，无 content）

```json
{
  "content": [],
  "kind": "read",
  "locations": [
    { "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt" }
  ],
  "status": "completed",
  "title": "tool-call-trace/test-write.txt",
  "toolCallId": "read_file__khfvqay1",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{ "type": "tool_call_update", "toolCallId": "read_file__khfvqay1", "status": "completed" }
```

---

## MCP Tool（fyllo-cortex / fyllo-specs）

> Gemini 的 MCP 工具调用没有独立的 tool_call_start，直接出现在 tool_call_update 中（completed）。

### tool_call_update（fyllo-cortex/guidelines，completed）

```json
{
  "content": [
    { "content": { "text": "{\"guidelines\": [...]}", "type": "text" }, "type": "content" }
  ],
  "kind": "other",
  "locations": [],
  "status": "completed",
  "title": "guidelines (fyllo-cortex MCP Server)",
  "toolCallId": "mcp_fyllo-cortex_guidelines__20jmm9fz",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "mcp_fyllo-cortex_guidelines__20jmm9fz",
  "status": "completed",
  "content": "{\"guidelines\": [...]}"
}
```

### tool_call_update（fyllo-specs/explore，completed，content 含完整工具指令）

```json
{
  "content": [
    {
      "content": {
        "text": "<tool_instruction>...</tool_instruction>\n\n<state>{\"projectRoot\": \"...\"}</state>",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "other",
  "locations": [],
  "status": "completed",
  "title": "explore (fyllo-specs MCP Server)",
  "toolCallId": "mcp_fyllo-specs_explore__3pn4nqtn",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "mcp_fyllo-specs_explore__3pn4nqtn",
  "status": "completed",
  "content": "<tool_instruction>...</tool_instruction>\n\n<state>...</state>"
}
```

---

## write_file（文件写入）

> Gemini 的写文件没有 tool_call_start，直接在 tool_call_update 中出现。

### tool_call_update（completed，携带 diff）

```json
{
  "content": [
    {
      "_meta": { "kind": "modify" },
      "newText": "tool call trace test - written via write_file tool\nSome initial text.\nAnother line.",
      "oldText": "tool call trace test - write + edit",
      "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
      "type": "diff"
    }
  ],
  "kind": "edit",
  "locations": [
    { "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt" }
  ],
  "status": "completed",
  "title": "Writing to tool-call-trace/test-write.txt",
  "toolCallId": "write_file__io9blt9k",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{ "type": "tool_call_update", "toolCallId": "write_file__io9blt9k", "status": "completed" }
```

---

## run_shell_command（Shell 命令执行）

### tool_call_start（in_progress，content 含描述）

```json
{
  "content": [
    {
      "content": {
        "text": "[current working directory /Users/tao/Work/Fio/projects/FylloCode] (A simple echo command to test tool tracing without altering state)",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "execute",
  "locations": [],
  "status": "in_progress",
  "title": "echo 'Tool Trace Bash Command'",
  "toolCallId": "run_shell_command__5e7fr5p2",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "run_shell_command__5e7fr5p2",
  "title": "echo 'Tool Trace Bash Command'",
  "kind": "execute"
}
```

### tool_call_update（completed，无 content）

```json
{
  "content": [],
  "kind": "execute",
  "locations": [],
  "status": "completed",
  "title": "echo 'Tool Trace Bash Command'",
  "toolCallId": "run_shell_command__5e7fr5p2",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{ "type": "tool_call_update", "toolCallId": "run_shell_command__5e7fr5p2", "status": "completed" }
```

### run_shell_command（后台执行，content 含 PID）

```json
{
  "content": [
    {
      "content": {
        "text": "Command moved to background (PID: 40344). Output hidden. Press Ctrl+B to view.",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "execute",
  "locations": [],
  "status": "completed",
  "title": "sleep 2 && echo 'Background task output success'",
  "toolCallId": "run_shell_command__as44dqcu",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "run_shell_command__as44dqcu",
  "status": "completed",
  "content": "Command moved to background (PID: 40344). Output hidden. Press Ctrl+B to view."
}
```

---

## list_background_processes（后台进程列表）

### tool_call_update（无 start，直接 completed）

```json
{
  "content": [
    { "content": { "text": "No background processes found.", "type": "text" }, "type": "content" }
  ],
  "kind": "read",
  "locations": [],
  "status": "completed",
  "title": "Lists all active and recently completed background processes for the current session.",
  "toolCallId": "list_background_processes__to9x50de",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "list_background_processes__to9x50de",
  "status": "completed",
  "content": "No background processes found."
}
```

---

## read_background_output（读取后台进程输出）

### tool_call_update（无 start，直接 completed）

```json
{
  "content": [
    {
      "content": { "text": "Full Log Output:\nBackground task output success\r", "type": "text" },
      "type": "content"
    }
  ],
  "kind": "read",
  "locations": [],
  "status": "completed",
  "title": "Reading output for background process 40344",
  "toolCallId": "read_background_output__1pksdcr2",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "read_background_output__1pksdcr2",
  "status": "completed",
  "content": "Full Log Output:\nBackground task output success\r"
}
```

---

## google_web_search（网络搜索）

### tool_call_start

```json
{
  "content": [],
  "kind": "search",
  "locations": [],
  "status": "in_progress",
  "title": "Searching the web for: \"FylloCode open source\"",
  "toolCallId": "google_web_search__vg0w3bed",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "google_web_search__vg0w3bed",
  "title": "Searching the web for: \"FylloCode open source\"",
  "kind": "search"
}
```

### tool_call_update（completed）

```json
{
  "content": [
    {
      "content": {
        "text": "Search results for \"FylloCode open source\" returned.",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "search",
  "locations": [],
  "status": "completed",
  "title": "Searching the web for: \"FylloCode open source\"",
  "toolCallId": "google_web_search__vg0w3bed",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "google_web_search__vg0w3bed",
  "status": "completed",
  "content": "Search results for \"FylloCode open source\" returned."
}
```

---

## web_fetch（网页获取）

### tool_call_update（无 start，直接 completed，kind 为 fetch）

```json
{
  "content": [
    { "content": { "text": "Content processed from prompt.", "type": "text" }, "type": "content" }
  ],
  "kind": "fetch",
  "locations": [],
  "status": "completed",
  "title": "Processing URLs and instructions from prompt: \"Retrieve the raw LICENSE file from GitHub: ...\"",
  "toolCallId": "web_fetch__geqolg6m",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "web_fetch__geqolg6m",
  "status": "completed",
  "content": "Content processed from prompt."
}
```

---

## activate_skill（技能激活）

### tool_call_update（无 start，直接 completed）

```json
{
  "content": [
    {
      "content": {
        "text": "Skill **changelog-generator** activated. Resources loaded from `...`:\n\n...",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "other",
  "locations": [],
  "status": "completed",
  "title": "\"changelog-generator\": Generate or update durable versioned changelog entries...",
  "toolCallId": "activate_skill__5ot1zmk5",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "activate_skill__5ot1zmk5",
  "status": "completed",
  "content": "Skill **changelog-generator** activated. Resources loaded from `...`:\n\n..."
}
```

---

## enter_plan_mode / exit_plan_mode（计划模式生命周期）

### enter_plan_mode（tool_call_update，无 start）

```json
{
  "content": [
    {
      "content": {
        "text": "Switching to Plan mode: Entering plan mode temporarily to test tool call flow and design a plan for final tool trace steps.",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "other",
  "locations": [],
  "status": "completed",
  "title": "Entering plan mode temporarily to test tool call flow and design a plan for final tool trace steps.",
  "toolCallId": "enter_plan_mode__f07mo3mk",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "enter_plan_mode__f07mo3mk",
  "status": "completed",
  "content": "Switching to Plan mode: Entering plan mode temporarily to test tool call flow..."
}
```

### write_file（Plan 模式下写 plan.md，有 start 和 completed）

```json
{
  "content": [],
  "kind": "edit",
  "locations": [
    {
      "path": "/Users/tao/.gemini/tmp/fyllocode/80df0ad6-ea4a-4916-925d-f323c4ff3230/plans/plan.md"
    }
  ],
  "status": "in_progress",
  "title": "Writing to ../.../plans/plan.md",
  "toolCallId": "write_file__zp6ke5at",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "write_file__zp6ke5at",
  "title": "Writing to ../.../plans/plan.md",
  "kind": "edit"
}
```

### replace（Plan 模式下编辑 plan.md，有 start 和 completed）

```json
{
  "content": [],
  "kind": "edit",
  "locations": [{ "path": "/Users/tao/.gemini/tmp/fyllocode/.../plans/plan.md" }],
  "status": "in_progress",
  "title": "../.../plans/plan.md: ## Changes... => ## Changes...",
  "toolCallId": "replace__zd60l8er",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "replace__zd60l8er",
  "title": "../.../plans/plan.md: ## Changes... => ## Changes...",
  "kind": "edit"
}
```

### exit_plan_mode（tool_call_update，无 start）

```json
{
  "content": [
    {
      "content": {
        "text": "Plan approved: /Users/tao/.gemini/tmp/fyllocode/.../plans/plan.md",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "other",
  "locations": [],
  "status": "completed",
  "title": "Requesting plan approval for: /Users/tao/.gemini/tmp/fyllocode/.../plans/plan.md",
  "toolCallId": "exit_plan_mode__otkpjhpa",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "exit_plan_mode__otkpjhpa",
  "status": "completed",
  "content": "Plan approved: /Users/tao/.gemini/tmp/fyllocode/.../plans/plan.md"
}
```

---

## replace（文件内容替换/编辑）

### tool_call_update（无 start，直接 completed，携带 diff）

```json
{
  "content": [
    {
      "_meta": { "kind": "modify" },
      "newText": "tool call trace test - written via write_file tool\nSome initial text that has been edited.\nAnother line.",
      "oldText": "tool call trace test - written via write_file tool\nSome initial text.\nAnother line.",
      "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
      "type": "diff"
    }
  ],
  "kind": "edit",
  "locations": [
    { "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt" }
  ],
  "status": "completed",
  "title": "tool-call-trace/test-write.txt: Some initial text. => Some initial text that has bee...",
  "toolCallId": "replace__pahgh2ix",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{ "type": "tool_call_update", "toolCallId": "replace__pahgh2ix", "status": "completed" }
```

---

## invoke_agent（子代理调用）

### tool_call_start（in_progress 直接启动）

```json
{
  "content": [],
  "kind": "think",
  "locations": [],
  "status": "in_progress",
  "title": "Delegating to agent 'codebase_investigator'",
  "toolCallId": "invoke_agent__andtacik",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "invoke_agent__andtacik",
  "title": "Delegating to agent 'codebase_investigator'",
  "kind": "think"
}
```

### tool_call_update（completed，无 content）

```json
{
  "content": [],
  "kind": "think",
  "locations": [],
  "status": "completed",
  "title": "Delegating to agent 'codebase_investigator'",
  "toolCallId": "invoke_agent__andtacik",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{ "type": "tool_call_update", "toolCallId": "invoke_agent__andtacik", "status": "completed" }
```

### invoke_agent（失败案例，tool_call_update status="failed"）

```json
{
  "content": [
    {
      "content": {
        "text": "Tool execution for \"Generalist Agent\" denied by policy.",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "think",
  "status": "failed",
  "toolCallId": "invoke_agent__fcg18kqj",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "invoke_agent__fcg18kqj",
  "status": "failed",
  "content": "Tool execution for \"Generalist Agent\" denied by policy."
}
```
