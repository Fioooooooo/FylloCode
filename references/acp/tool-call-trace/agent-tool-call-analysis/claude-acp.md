# claude-acp Tool Call 原始协议

Agent: `claude-acp`  
ACP Session: `8fbe3795-bd46-42c1-b161-6bb0eab4dbf9`

---

## Bash（Shell 命令执行）

### tool_call_start（pending 状态）

```json
{
  "_meta": { "claudeCode": { "toolName": "Bash" } },
  "content": [],
  "kind": "execute",
  "rawInput": {},
  "status": "pending",
  "title": "Terminal",
  "toolCallId": "tooluse_AYRgO4yuVZzFtZakzLAaUs",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "tooluse_AYRgO4yuVZzFtZakzLAaUs",
  "title": "Bash",
  "kind": "execute"
}
```

### tool_call_update（in_progress，携带 rawInput）

```json
{
  "_meta": { "claudeCode": { "toolName": "Bash" } },
  "content": [
    { "content": { "text": "列出 tool-call-trace 目录内容", "type": "text" }, "type": "content" }
  ],
  "kind": "execute",
  "rawInput": {
    "command": "ls /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/",
    "description": "列出 tool-call-trace 目录内容"
  },
  "title": "ls /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/",
  "toolCallId": "tooluse_AYRgO4yuVZzFtZakzLAaUs",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_AYRgO4yuVZzFtZakzLAaUs",
  "status": "in_progress",
  "input": {
    "command": "ls /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/",
    "description": "列出 tool-call-trace 目录内容"
  },
  "content": "列出 tool-call-trace 目录内容"
}
```

### tool_call_update（in_progress，携带 toolResponse）

```json
{
  "_meta": {
    "claudeCode": {
      "toolResponse": {
        "stdout": "do-not-modify",
        "stderr": "",
        "interrupted": false,
        "isImage": false,
        "noOutputExpected": false
      },
      "toolName": "Bash"
    }
  },
  "toolCallId": "tooluse_AYRgO4yuVZzFtZakzLAaUs",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_AYRgO4yuVZzFtZakzLAaUs",
  "status": "in_progress"
}
```

### tool_call_update（completed，携带 rawOutput）

````json
{
  "_meta": { "claudeCode": { "toolName": "Bash" } },
  "content": [
    { "content": { "text": "```console\ndo-not-modify\n```", "type": "text" }, "type": "content" }
  ],
  "rawOutput": "do-not-modify",
  "status": "completed",
  "toolCallId": "tooluse_AYRgO4yuVZzFtZakzLAaUs",
  "sessionUpdate": "tool_call_update"
}
````

映射输出：

````json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_AYRgO4yuVZzFtZakzLAaUs",
  "status": "completed",
  "content": "```console\ndo-not-modify\n```"
}
````

---

## Glob（文件模式搜索）

### tool_call_start（pending 状态）

```json
{
  "_meta": { "claudeCode": { "toolName": "Glob" } },
  "content": [],
  "kind": "search",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "Find",
  "toolCallId": "tooluse_6maD14ffQGR36pHGnG5CWa",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "tooluse_6maD14ffQGR36pHGnG5CWa",
  "title": "Glob",
  "kind": "search"
}
```

### tool_call_update（in_progress，携带 rawInput + locations）

```json
{
  "_meta": { "claudeCode": { "toolName": "Glob" } },
  "content": [],
  "kind": "search",
  "locations": [{ "path": "/Users/tao/Work/Fio/projects/FylloCode" }],
  "rawInput": {
    "pattern": "tool-call-trace/**/*",
    "path": "/Users/tao/Work/Fio/projects/FylloCode"
  },
  "title": "Find `/Users/tao/Work/Fio/projects/FylloCode` `tool-call-trace/**/*`",
  "toolCallId": "tooluse_6maD14ffQGR36pHGnG5CWa",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_6maD14ffQGR36pHGnG5CWa",
  "status": "in_progress",
  "input": { "pattern": "tool-call-trace/**/*", "path": "/Users/tao/Work/Fio/projects/FylloCode" }
}
```

### tool_call_update（in_progress，携带 toolResponse）

```json
{
  "_meta": {
    "claudeCode": {
      "toolResponse": {
        "filenames": [
          "tool-call-trace/do-not-modify/claude-acp.txt",
          "tool-call-trace/do-not-modify/codex-acp.txt",
          "tool-call-trace/do-not-modify/gemini.txt",
          "tool-call-trace/do-not-modify/qodercli.txt"
        ],
        "durationMs": 1288,
        "numFiles": 4,
        "truncated": false
      },
      "toolName": "Glob"
    }
  },
  "toolCallId": "tooluse_6maD14ffQGR36pHGnG5CWa",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_6maD14ffQGR36pHGnG5CWa",
  "status": "in_progress"
}
```

### tool_call_update（completed，携带 rawOutput）

```json
{
  "_meta": { "claudeCode": { "toolName": "Glob" } },
  "content": [
    {
      "content": {
        "text": "tool-call-trace/do-not-modify/claude-acp.txt\ntool-call-trace/do-not-modify/codex-acp.txt\ntool-call-trace/do-not-modify/gemini.txt\ntool-call-trace/do-not-modify/qodercli.txt",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "tool-call-trace/do-not-modify/claude-acp.txt\ntool-call-trace/do-not-modify/codex-acp.txt\ntool-call-trace/do-not-modify/gemini.txt\ntool-call-trace/do-not-modify/qodercli.txt",
  "status": "completed",
  "toolCallId": "tooluse_6maD14ffQGR36pHGnG5CWa",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_6maD14ffQGR36pHGnG5CWa",
  "status": "completed",
  "content": "tool-call-trace/do-not-modify/claude-acp.txt\ntool-call-trace/do-not-modify/codex-acp.txt\ntool-call-trace/do-not-modify/gemini.txt\ntool-call-trace/do-not-modify/qodercli.txt"
}
```

---

## Read（文件读取）

### tool_call_start（pending 状态）

```json
{
  "_meta": { "claudeCode": { "toolName": "Read" } },
  "content": [],
  "kind": "read",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "Read File",
  "toolCallId": "tooluse_loLsIa1C6TYeyQlSDC3OOI",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "tooluse_loLsIa1C6TYeyQlSDC3OOI",
  "title": "Read",
  "kind": "read"
}
```

### tool_call_update（in_progress，携带 rawInput + locations）

```json
{
  "_meta": { "claudeCode": { "toolName": "Read" } },
  "content": [],
  "kind": "read",
  "locations": [
    {
      "line": 1,
      "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/do-not-modify/claude-acp.txt"
    }
  ],
  "rawInput": {
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/do-not-modify/claude-acp.txt"
  },
  "title": "Read tool-call-trace/do-not-modify/claude-acp.txt",
  "toolCallId": "tooluse_loLsIa1C6TYeyQlSDC3OOI",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_loLsIa1C6TYeyQlSDC3OOI",
  "status": "in_progress",
  "input": {
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/do-not-modify/claude-acp.txt"
  }
}
```

### tool_call_update（in_progress，携带 toolResponse）

```json
{
  "_meta": {
    "claudeCode": {
      "toolResponse": {
        "type": "text",
        "file": {
          "filePath": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/do-not-modify/claude-acp.txt",
          "content": "",
          "numLines": 1,
          "startLine": 1,
          "totalLines": 1
        }
      },
      "toolName": "Read"
    }
  },
  "toolCallId": "tooluse_loLsIa1C6TYeyQlSDC3OOI",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_loLsIa1C6TYeyQlSDC3OOI",
  "status": "in_progress"
}
```

### tool_call_update（completed，携带 rawOutput）

````json
{
  "_meta": { "claudeCode": { "toolName": "Read" } },
  "content": [
    {
      "content": {
        "text": "```\n<system-reminder>Warning: the file exists but is shorter than the provided offset (1). The file has 1 lines.</system-reminder>\n```",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "<system-reminder>Warning: the file exists but is shorter than the provided offset (1). The file has 1 lines.</system-reminder>",
  "status": "completed",
  "toolCallId": "tooluse_loLsIa1C6TYeyQlSDC3OOI",
  "sessionUpdate": "tool_call_update"
}
````

映射输出：

````json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_loLsIa1C6TYeyQlSDC3OOI",
  "status": "completed",
  "content": "```\n<system-reminder>Warning: the file exists but is shorter than the provided offset (1). The file has 1 lines.</system-reminder>\n```"
}
````

---

## Write（文件写入）

### tool_call_start（pending 状态）

```json
{
  "_meta": { "claudeCode": { "toolName": "Write" } },
  "content": [],
  "kind": "edit",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "Write",
  "toolCallId": "tooluse_aT5ep01HRl5AQzVJEEOeHZ",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "tooluse_aT5ep01HRl5AQzVJEEOeHZ",
  "title": "Write",
  "kind": "edit"
}
```

### tool_call_update（in_progress，携带 rawInput + diff + locations）

```json
{
  "_meta": { "claudeCode": { "toolName": "Write" } },
  "content": [
    {
      "newText": "tool call trace test - write",
      "oldText": null,
      "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
      "type": "diff"
    }
  ],
  "kind": "edit",
  "locations": [
    { "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt" }
  ],
  "rawInput": {
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
    "content": "tool call trace test - write"
  },
  "title": "Write tool-call-trace/test-write.txt",
  "toolCallId": "tooluse_aT5ep01HRl5AQzVJEEOeHZ",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_aT5ep01HRl5AQzVJEEOeHZ",
  "status": "in_progress",
  "input": {
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
    "content": "tool call trace test - write"
  }
}
```

### tool_call_update（in_progress，携带 toolResponse）

```json
{
  "_meta": {
    "claudeCode": {
      "toolResponse": {
        "type": "create",
        "filePath": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
        "content": "tool call trace test - write",
        "structuredPatch": [],
        "originalFile": null,
        "userModified": false
      },
      "toolName": "Write"
    }
  },
  "toolCallId": "tooluse_aT5ep01HRl5AQzVJEEOeHZ",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_aT5ep01HRl5AQzVJEEOeHZ",
  "status": "in_progress"
}
```

### tool_call_update（completed）

```json
{
  "_meta": { "claudeCode": { "toolName": "Write" } },
  "rawOutput": "File created successfully at: /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt (file state is current in your context — no need to Read it back)",
  "status": "completed",
  "toolCallId": "tooluse_aT5ep01HRl5AQzVJEEOeHZ",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_aT5ep01HRl5AQzVJEEOeHZ",
  "status": "completed"
}
```

---

## Edit（文件编辑）

### tool_call_start（pending 状态）

```json
{
  "_meta": { "claudeCode": { "toolName": "Edit" } },
  "content": [],
  "kind": "edit",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "Edit",
  "toolCallId": "tooluse_lwz4K4sGhb9byJYHJJ9gfB",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "tooluse_lwz4K4sGhb9byJYHJJ9gfB",
  "title": "Edit",
  "kind": "edit"
}
```

### tool_call_update（in_progress，携带 rawInput + diff）

```json
{
  "_meta": { "claudeCode": { "toolName": "Edit" } },
  "content": [
    {
      "newText": "tool call trace test - write + edit",
      "oldText": "tool call trace test - write",
      "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
      "type": "diff"
    }
  ],
  "kind": "edit",
  "locations": [
    { "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt" }
  ],
  "rawInput": {
    "replace_all": false,
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
    "old_string": "tool call trace test - write",
    "new_string": "tool call trace test - write + edit"
  },
  "title": "Edit tool-call-trace/test-write.txt",
  "toolCallId": "tooluse_lwz4K4sGhb9byJYHJJ9gfB",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_lwz4K4sGhb9byJYHJJ9gfB",
  "status": "in_progress",
  "input": {
    "replace_all": false,
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
    "old_string": "tool call trace test - write",
    "new_string": "tool call trace test - write + edit"
  }
}
```

### tool_call_update（in_progress，携带 toolResponse + structuredPatch diff）

```json
{
  "_meta": {
    "claudeCode": {
      "toolResponse": {
        "filePath": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
        "oldString": "tool call trace test - write",
        "newString": "tool call trace test - write + edit",
        "originalFile": "tool call trace test - write",
        "structuredPatch": [
          {
            "oldStart": 1,
            "oldLines": 1,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              "-tool call trace test - write",
              "\\ No newline at end of file",
              "+tool call trace test - write + edit",
              "\\ No newline at end of file"
            ]
          }
        ],
        "userModified": false,
        "replaceAll": false
      },
      "toolName": "Edit"
    }
  },
  "content": [
    {
      "newText": " No newline at end of file\ntool call trace test - write + edit\n No newline at end of file",
      "oldText": "tool call trace test - write\n No newline at end of file\n No newline at end of file",
      "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt",
      "type": "diff"
    }
  ],
  "locations": [
    { "line": 1, "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt" }
  ],
  "toolCallId": "tooluse_lwz4K4sGhb9byJYHJJ9gfB",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_lwz4K4sGhb9byJYHJJ9gfB",
  "status": "in_progress"
}
```

### tool_call_update（completed）

```json
{
  "_meta": { "claudeCode": { "toolName": "Edit" } },
  "rawOutput": "The file /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt has been updated successfully. (file state is current in your context — no need to Read it back)",
  "status": "completed",
  "toolCallId": "tooluse_lwz4K4sGhb9byJYHJJ9gfB",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_lwz4K4sGhb9byJYHJJ9gfB",
  "status": "completed"
}
```

---

## Grep（内容搜索）

### tool_call_start（pending 状态）

```json
{
  "_meta": { "claudeCode": { "toolName": "Grep" } },
  "content": [],
  "kind": "search",
  "rawInput": {},
  "status": "pending",
  "title": "grep",
  "toolCallId": "tooluse_yUS2kXq4O3L4eoTlYkVWXE",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "tooluse_yUS2kXq4O3L4eoTlYkVWXE",
  "title": "Grep",
  "kind": "search"
}
```

### tool_call_update（in_progress，携带 rawInput）

```json
{
  "_meta": { "claudeCode": { "toolName": "Grep" } },
  "content": [],
  "kind": "search",
  "rawInput": {
    "pattern": "tool call trace",
    "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace",
    "output_mode": "content"
  },
  "title": "grep \"tool call trace\" /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace",
  "toolCallId": "tooluse_yUS2kXq4O3L4eoTlYkVWXE",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_yUS2kXq4O3L4eoTlYkVWXE",
  "status": "in_progress",
  "input": {
    "pattern": "tool call trace",
    "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace",
    "output_mode": "content"
  }
}
```

### tool_call_update（in_progress，携带 toolResponse）

```json
{
  "_meta": {
    "claudeCode": {
      "toolResponse": {
        "mode": "content",
        "numFiles": 0,
        "filenames": [],
        "content": "tool-call-trace/test-write.txt:1:tool call trace test - write + edit",
        "numLines": 1
      },
      "toolName": "Grep"
    }
  },
  "toolCallId": "tooluse_yUS2kXq4O3L4eoTlYkVWXE",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_yUS2kXq4O3L4eoTlYkVWXE",
  "status": "in_progress"
}
```

### tool_call_update（completed）

```json
{
  "_meta": { "claudeCode": { "toolName": "Grep" } },
  "content": [
    {
      "content": {
        "text": "tool-call-trace/test-write.txt:1:tool call trace test - write + edit",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "tool-call-trace/test-write.txt:1:tool call trace test - write + edit",
  "status": "completed",
  "toolCallId": "tooluse_yUS2kXq4O3L4eoTlYkVWXE",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_yUS2kXq4O3L4eoTlYkVWXE",
  "status": "completed",
  "content": "tool-call-trace/test-write.txt:1:tool call trace test - write + edit"
}
```

---

## TaskCreate / TaskUpdate（任务管理）

> Claude Code 的 `TaskCreate` / `TaskUpdate` 工具不走 `tool_call` 事件，而是直接触发 ACP 的 `plan` 事件。

### plan（任务创建后触发）

```json
{
  "entries": [{ "content": "tool-call-trace 测试任务", "priority": "medium", "status": "pending" }],
  "sessionUpdate": "plan"
}
```

映射输出：

```json
{
  "type": "plan_update",
  "entries": [{ "content": "tool-call-trace 测试任务", "priority": "medium", "status": "pending" }]
}
```

### plan（任务更新为 completed）

```json
{
  "entries": [
    { "content": "tool-call-trace 测试任务", "priority": "medium", "status": "completed" }
  ],
  "sessionUpdate": "plan"
}
```

映射输出：

```json
{
  "type": "plan_update",
  "entries": [
    { "content": "tool-call-trace 测试任务", "priority": "medium", "status": "completed" }
  ]
}
```

---

## Agent（子代理）

### tool_call_start（pending 状态）

```json
{
  "_meta": { "claudeCode": { "toolName": "Agent" } },
  "content": [],
  "kind": "think",
  "rawInput": {},
  "status": "pending",
  "title": "Task",
  "toolCallId": "tooluse_ZZh1LLv3jokPPukzlpcDYB",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "tooluse_ZZh1LLv3jokPPukzlpcDYB",
  "title": "Agent",
  "kind": "think"
}
```

### tool_call_update（in_progress，携带 rawInput）

```json
{
  "_meta": { "claudeCode": { "toolName": "Agent" } },
  "content": [
    {
      "content": {
        "text": "请读取 /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt 的内容并返回。只需要返回文件内容，不需要其他说明。",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "kind": "think",
  "rawInput": {
    "description": "tool-call-trace Agent 子代理测试",
    "subagent_type": "Explore",
    "prompt": "请读取 /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt 的内容并返回。只需要返回文件内容，不需要其他说明。"
  },
  "title": "tool-call-trace Agent 子代理测试",
  "toolCallId": "tooluse_ZZh1LLv3jokPPukzlpcDYB",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_ZZh1LLv3jokPPukzlpcDYB",
  "status": "in_progress",
  "input": {
    "description": "tool-call-trace Agent 子代理测试",
    "subagent_type": "Explore",
    "prompt": "请读取 .../test-write.txt 的内容并返回。只需要返回文件内容，不需要其他说明。"
  }
}
```

### 子代理内嵌 tool_call（Read，parentToolUseId 指向父 Agent）

```json
{
  "_meta": {
    "claudeCode": { "toolName": "Read", "parentToolUseId": "tooluse_ZZh1LLv3jokPPukzlpcDYB" }
  },
  "content": [],
  "kind": "read",
  "locations": [
    { "line": 1, "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt" }
  ],
  "rawInput": {
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt"
  },
  "status": "pending",
  "title": "Read tool-call-trace/test-write.txt",
  "toolCallId": "tooluse_NgKl7Hu74yofC7pyVcfNZt",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "tooluse_NgKl7Hu74yofC7pyVcfNZt",
  "title": "Read",
  "kind": "read"
}
```

### tool_call_update（in_progress，携带 toolResponse，包含完整 agentId 等统计）

```json
{
  "_meta": {
    "claudeCode": {
      "toolResponse": {
        "status": "completed",
        "prompt": "请读取 .../test-write.txt ...",
        "agentId": "a3b816cf25f9bf069",
        "agentType": "Explore",
        "content": [{ "text": "工具调用" }],
        "totalDurationMs": 5475,
        "totalTokens": 24537,
        "totalToolUseCount": 1,
        "usage": {
          "input_tokens": 2842,
          "cache_creation_input_tokens": 0,
          "cache_read_input_tokens": 21677,
          "output_tokens": 18
        },
        "toolStats": {
          "readCount": 1,
          "searchCount": 0,
          "bashCount": 0,
          "editFileCount": 0,
          "linesAdded": 0,
          "linesRemoved": 0,
          "otherToolCount": 0
        }
      },
      "toolName": "Agent"
    }
  },
  "toolCallId": "tooluse_ZZh1LLv3jokPPukzlpcDYB",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_ZZh1LLv3jokPPukzlpcDYB",
  "status": "in_progress"
}
```

### tool_call_update（completed）

```json
{
  "_meta": { "claudeCode": { "toolName": "Agent" } },
  "content": [
    { "content": { "text": "工具调用跟踪测试 - 写入 + 编辑", "type": "text" }, "type": "content" }
  ],
  "rawOutput": [{ "text": "工具调用跟踪测试 - 写入 + 编辑", "type": "text" }],
  "status": "completed",
  "toolCallId": "tooluse_ZZh1LLv3jokPPukzlpcDYB",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "tooluse_ZZh1LLv3jokPPukzlpcDYB",
  "status": "completed",
  "content": "工具调用跟踪测试 - 写入 + 编辑"
}
```
