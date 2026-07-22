# codex-acp Tool Call Trace

## 特征摘要

- 所有 tool_call 的 `status` 均为 `in_progress`（无 pending 阶段）
- `rawInput` 在 `tool_call` 事件中就已携带完整参数（无二阶段揭示）
- native 工具（read/execute/search/edit）的 rawInput 包含完整 shell 命令元数据：
  `{call_id, process_id, turn_id, started_at_ms, command: ["/bin/zsh","-lc","..."], cwd, parsed_cmd, source}`
- `parsed_cmd` 字段由 codex 自动解析 shell 命令得出，包含 `type`（read/list_files/search/unknown）及路径
- MCP 工具 rawInput 结构为 `{server, tool, arguments}`，无 shell 命令元数据
- Edit 的 `content` 字段在 `tool_call` 起始时就已携带 diff 数据（与其他 agent 不同）
- sub-agent 通过 `kind: execute` + bash 命令 `codex exec --json --ephemeral` 实现，不是独立 tool 类型

---

### MCP Tool（fyllo-cortex/guidelines）

```
← tool_call {
  "rawInput": {"server":"fyllo-cortex","tool":"guidelines","arguments":{"mode":"read"}},
  "status": "in_progress",
  "title": "Tool: fyllo-cortex/guidelines",
  "toolCallId": "call_rivVn0kqMOGaXTNCAySriJT6",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_rivVn0kqMOGaXTNCAySriJT6","title":"Tool: fyllo-cortex/guidelines","kind":"other"}

← tool_call_update {
  "content": [{"content":{"text":"{ \"guidelines\": [...] }","type":"text"},"type":"content"}],
  "rawOutput": {"content":[{"type":"text","text":"..."}]},
  "status": "completed",
  "toolCallId": "call_rivVn0kqMOGaXTNCAySriJT6",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_rivVn0kqMOGaXTNCAySriJT6","status":"completed","content":"{ \"guidelines\": [...] }"}
```

**特点：**

- `kind: "other"`，无 `locations`
- rawInput 为 `{server, tool, arguments}`，无 shell 命令
- rawOutput 为 `{content: [{type, text}]}`（MCP 标准响应格式）
- 一次 tool_call_start + 一次 tool_call_update completed（无中间 in_progress 更新）

---

### MCP Tool（fyllo-specs/explore）

```
← tool_call {
  "rawInput": {"server":"fyllo-specs","tool":"explore","arguments":{"targetPath":"...","includeInstruction":true}},
  "status": "in_progress",
  "title": "Tool: fyllo-specs/explore",
  "toolCallId": "call_wul6BWSIjmtL...",
  "sessionUpdate": "tool_call"
}
```

---

### MCP Tool（codex/list_mcp_resources）

```
← tool_call {
  "rawInput": {"server":"codex","tool":"list_mcp_resources","arguments":{"cursor":"","server":""}},
  "status": "in_progress",
  "title": "Tool: codex/list_mcp_resources",
  "toolCallId": "call_sOKwuYFAqrIBAmMFZzf33lK3",
  "sessionUpdate": "tool_call"
}
```

---

### Search（list files，rg --files）

```
← tool_call {
  "kind": "search",
  "locations": [{"path":"/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace"}],
  "rawInput": {
    "call_id": "call_JM3ANahhXJUNF3q43vLNr1XR",
    "process_id": "17686",
    "turn_id": "019eb050-9f3b-7581-ba28-d574e386a67e",
    "started_at_ms": 1781074589834,
    "command": ["/bin/zsh","-lc","rg --files tool-call-trace"],
    "cwd": "/Users/tao/Work/Fio/projects/FylloCode",
    "parsed_cmd": [{"type":"list_files","cmd":"rg --files tool-call-trace","path":"tool-call-trace"}],
    "source": "unified_exec_startup"
  },
  "status": "in_progress",
  "title": "List /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace",
  "toolCallId": "call_JM3ANahhXJUNF3q43vLNr1XR",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_JM3ANahhXJUNF3q43vLNr1XR","title":"List ...","kind":"search"}
```

**特点：**

- `kind: "search"`，`parsed_cmd[0].type` 为 `"list_files"`
- title 自动前缀 `List` + 路径
- 底层实现是 `rg --files`，被 codex 识别为文件列举操作

---

### Execute（pwd）

```
← tool_call {
  "kind": "execute",
  "rawInput": {
    "call_id": "call_e7ZFyOTCUrGbZr1asp6XnU8S",
    "process_id": "64031",
    "turn_id": "019eb050-9f3b-7581-ba28-d574e386a67e",
    "started_at_ms": 1781074589834,
    "command": ["/bin/zsh","-lc","pwd"],
    "cwd": "/Users/tao/Work/Fio/projects/FylloCode",
    "parsed_cmd": [{"type":"unknown","cmd":"pwd"}],
    "source": "unified_exec_startup"
  },
  "status": "in_progress",
  "title": "pwd",
  "toolCallId": "call_e7ZFyOTCUrGbZr1asp6XnU8S",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_e7ZFyOTCUrGbZr1asp6XnU8S","title":"pwd","kind":"execute"}
```

---

### Read（sed -n 读取文件）

```
← tool_call {
  "kind": "read",
  "locations": [{"path":"/Users/tao/Work/Fio/projects/FylloCode/guidelines/DeveloperWorkflow.md"}],
  "rawInput": {
    "call_id": "call_FLgtqar7od4rcyrXjjhjxOVX",
    "process_id": "3437",
    "turn_id": "019eb050-9f3b-7581-ba28-d574e386a67e",
    "started_at_ms": 1781074605533,
    "command": ["/bin/zsh","-lc","sed -n '1,180p' guidelines/DeveloperWorkflow.md"],
    "cwd": "/Users/tao/Work/Fio/projects/FylloCode",
    "parsed_cmd": [{"type":"read","cmd":"sed -n '1,180p' guidelines/DeveloperWorkflow.md","name":"DeveloperWorkflow.md","path":"guidelines/DeveloperWorkflow.md"}],
    "source": "unified_exec_startup"
  },
  "status": "in_progress",
  "title": "Read DeveloperWorkflow.md",
  "toolCallId": "call_FLgtqar7od4rcyrXjjhjxOVX",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_FLgtqar7od4rcyrXjjhjxOVX","title":"Read DeveloperWorkflow.md","kind":"read"}

← tool_call_update {
  "rawOutput": {
    "call_id": "call_FLgtqar7od4rcyrXjjhjxOVX",
    "process_id": "3437",
    "completed_at_ms": 1781074605533,
    "command": ["/bin/zsh","-lc","sed -n '1,180p' guidelines/DeveloperWorkflow.md"],
    "stdout": "---\nname: DeveloperWorkflow\n...",
    "stderr": "",
    "aggregated_output": "...",
    "exit_code": 0,
    "duration": {"secs":0,"nanos":7632},
    "formatted_output": "...",
    "status": "completed"
  },
  "status": "completed",
  "toolCallId": "call_FLgtqar7od4rcyrXjjhjxOVX",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_FLgtqar7od4rcyrXjjhjxOVX","status":"completed"}
```

**特点：**

- `kind: "read"`，底层是 `sed -n '1,Np'` 命令
- rawOutput 包含 `stdout/stderr/exit_code/duration/aggregated_output/formatted_output`
- acp-mapper 输出的 `tool_call_update` 无 content 字段（content 由 rawOutput 携带但未透传）

---

### Search（grep -R 文本搜索）

```
← tool_call {
  "kind": "search",
  "rawInput": {
    "call_id": "call_hndEo4882KHnSBvuwk9ahleM",
    "process_id": "86612",
    "turn_id": "019eb050-9f3b-7581-ba28-d574e386a67e",
    "started_at_ms": 1781074605557,
    "command": ["/bin/zsh","-lc","grep -R -n \"tool_call|tool-call|do-not-modify\" ..."],
    "cwd": "/Users/tao/Work/Fio/projects/FylloCode",
    "parsed_cmd": [{"type":"search","cmd":"grep -R -n ...","query":"...","path":"..."}],
    "source": "unified_exec_startup"
  },
  "status": "in_progress",
  "title": "Search ... in ...",
  "toolCallId": "call_hndEo4882KHnSBvuwk9ahleM",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_hndEo4882KHnSBvuwk9ahleM","title":"Search ...","kind":"search"}

← tool_call_update {
  "rawOutput": {
    "stdout": "...",
    "exit_code": 0,
    "status": "completed"
  },
  "status": "completed",
  "toolCallId": "call_hndEo4882KHnSBvuwk9ahleM",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_hndEo4882KHnSBvuwk9ahleM","status":"completed"}
```

**特点：**

- `kind: "search"`，`parsed_cmd[0].type` 为 `"search"`
- title 格式为 `Search <query> in <path>`

---

### Edit（新建文件）

```
← tool_call {
  "content": [{"newText":"tool call trace scratch - created\n","path":"...codex-tool-call-scratch.txt","type":"diff"}],
  "kind": "edit",
  "locations": [{"path":"/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/codex-tool-call-scratch.txt"}],
  "rawInput": {
    "call_id": "call_FcDlWLO8oHCgxJXwx70yu9fJ",
    "turn_id": "019eb050-9f3b-7581-ba28-d574e386a67e",
    "auto_approved": true,
    "changes": {
      "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/codex-tool-call-scratch.txt": {
        "type": "add",
        "content": "tool call trace scratch - created\n"
      }
    }
  },
  "status": "in_progress",
  "title": "Edit /Users/tao/.../codex-tool-call-scratch.txt",
  "toolCallId": "call_FcDlWLO8oHCgxJXwx70yu9fJ",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_FcDlWLO8oHCgxJXwx70yu9fJ","title":"Edit ...","kind":"edit"}

← tool_call_update {
  "content": [{"newText":"tool call trace scratch - created\n","path":"...","type":"diff"}],
  "locations": [{"path":"..."}],
  "rawOutput": {
    "call_id": "call_FcDlWLO8oHCgxJXwx70yu9fJ",
    "stdout": "Success. Updated the following files:\nA tool-call-trace/codex-tool-call-scratch.txt\n",
    "stderr": "",
    "success": true,
    "changes": {"/Users/tao/.../codex-tool-call-scratch.txt":{"type":"add","content":"tool call trace scratch - created\n"}},
    "status": "completed"
  },
  "status": "completed",
  "title": "Edit ...",
  "toolCallId": "call_FcDlWLO8oHCgxJXwx70yu9fJ",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_FcDlWLO8oHCgxJXwx70yu9fJ","status":"completed"}
```

**特点（新建）：**

- `content[0].type === "diff"`，只有 `newText`，无 `oldText`（新建）
- rawInput.changes 中 `type: "add"`，携带完整文件内容
- rawOutput.stdout 前缀 `A`（git-style add）

---

### Edit（修改现有文件）

```
← tool_call {
  "content": [{"newText":"tool call trace scratch - created + edited\n","oldText":"tool call trace scratch - created\n","path":"...","type":"diff"}],
  "kind": "edit",
  "rawInput": {
    "call_id": "call_LCkQJcP2OqSItvLHhQYdo7OR",
    "auto_approved": true,
    "changes": {
      "/Users/tao/.../codex-tool-call-scratch.txt": {
        "type": "update",
        "unified_diff": "@@ -1 +1 @@\n-tool call trace scratch - created\n+tool call trace scratch - created + edited\n",
        "move_path": null
      }
    }
  },
  "status": "in_progress",
  "title": "Edit ...",
  "toolCallId": "call_LCkQJcP2OqSItvLHhQYdo7OR",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_LCkQJcP2OqSItvLHhQYdo7OR","title":"Edit ...","kind":"edit"}

← tool_call_update {
  "content": [{"newText":"...+ edited\n","oldText":"...- created\n","path":"...","type":"diff"}],
  "rawOutput": {
    "stdout": "Success. Updated the following files:\nM tool-call-trace/codex-tool-call-scratch.txt\n",
    "success": true,
    "changes": {"...": {"type":"update","unified_diff":"@@ -1 +1 @@\n-...\n+...\n","move_path":null}},
    "status": "completed"
  },
  "status": "completed",
  "toolCallId": "call_LCkQJcP2OqSItvLHhQYdo7OR",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_LCkQJcP2OqSItvLHhQYdo7OR","status":"completed"}
```

**特点（修改）：**

- `content[0]` 同时含 `newText` 和 `oldText`
- rawInput.changes 中 `type: "update"`，携带 `unified_diff`
- rawOutput.stdout 前缀 `M`

---

### Execute（zsh 交互式终端）

```
← tool_call {
  "kind": "execute",
  "rawInput": {
    "call_id": "call_JcWJ5RJeEl49bkIPaow84wcV",
    "process_id": "64548",
    "started_at_ms": 1781074652276,
    "command": ["/bin/zsh","-lc","zsh"],
    "cwd": "/Users/tao/Work/Fio/projects/FylloCode",
    "parsed_cmd": [{"type":"unknown","cmd":"zsh"}],
    "source": "unified_exec_startup"
  },
  "status": "in_progress",
  "title": "zsh",
  "toolCallId": "call_JcWJ5RJeEl49bkIPaow84wcV",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_JcWJ5RJeEl49bkIPaow84wcV","title":"zsh","kind":"execute"}
```

**特点：**

- 交互式 shell 启动，无即时 tool_call_update（长时间运行）
- title 直接为命令名 `zsh`

---

### Execute（Sub-Agent 通过 codex exec 派生）

````
← tool_call {
  "kind": "execute",
  "rawInput": {
    "call_id": "call_CMKTDzGS3f4yJdTD04pxiNlF",
    "process_id": "93011",
    "started_at_ms": 1781075133668,
    "command": ["/bin/zsh","-lc","codex exec --json --ephemeral --sandbox read-only -C /Users/tao/Work/Fio/projects/FylloCode 'Trace test only. Do not edit files...'"],
    "cwd": "/Users/tao/Work/Fio/projects/FylloCode",
    "parsed_cmd": [{"type":"unknown","cmd":"codex exec --json --ephemeral --sandbox read-only ..."}],
    "source": "unified_exec_startup"
  },
  "status": "in_progress",
  "title": "codex exec --json --ephemeral ...",
  "toolCallId": "call_CMKTDzGS3f4yJdTD04pxiNlF",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_CMKTDzGS3f4yJdTD04pxiNlF","title":"codex exec --json --ephemeral ...","kind":"execute"}

← tool_call_update {
  "content": [{"content":{"text":"```sh\nReading additional input from stdin...\n{\"type\":\"thread.started\",...}\n{\"type\":\"turn.started\"}\n{\"type\":\"item.started\",\"item\":{\"type\":\"command_execution\",\"command\":\"/bin/zsh -lc pwd\",...}}\n..."},"type":"content"}],
  "rawOutput": {"stdout":"...codex --json output stream...","status":"completed"},
  "status": "completed",
  "toolCallId": "call_CMKTDzGS3f4yJdTD04pxiNlF",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_CMKTDzGS3f4yJdTD04pxiNlF","status":"completed","content":"```sh\n..."}
````

**特点：**

- codex 的 sub-agent 不是独立的 tool 类型，而是 `kind: "execute"` 的 bash 命令
- `codex exec --json` 输出为 NDJSON 流，子会话的 tool_call 事件以 JSON 行形式内嵌在 content.text 中
- `--ephemeral` 表示临时子会话，`--sandbox read-only` 限制文件写入
- 与 qodercli 的 `call_function_<id>_<seq>` 或 claude 的 `parentToolUseId` 不同，codex 无嵌套 ACP 事件
