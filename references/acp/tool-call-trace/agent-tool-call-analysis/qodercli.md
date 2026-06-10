# qodercli Tool Call 原始协议

Agent: `qoder`（qodercli）  
ACP Session: `3bf493b3-4493-454d-b38f-61ef3b8504d5`

> qodercli 的特点：
>
> - toolCallId 格式为 `toolu_bdrk_<id>`（Anthropic 工具调用 ID 前缀）
> - 有专属的 `TodoWrite` 工具（任务列表管理），每步操作前后都会调用
> - Glob/Grep 依赖 ripgrep 二进制，在本次测试中因 binary 缺失而失败
> - 子代理（Agent Explore）内部的 tool call，toolCallId 格式为 `call_function_<id>_<序号>`
> - tool_call_start 时 status 为 `in_progress`（无 pending 过渡）

---

## TodoWrite（任务列表管理）

### tool_call_start（in_progress）

```json
{
  "content": [],
  "kind": "other",
  "locations": [],
  "rawInput": {
    "todos": [
      { "description": "Read a file", "status": "pending" },
      { "description": "Write a file", "status": "pending" },
      { "description": "Edit a file", "status": "pending" },
      { "description": "Glob (file pattern search)", "status": "pending" },
      { "description": "Grep (content search)", "status": "pending" },
      { "description": "Bash command", "status": "pending" },
      { "description": "Agent tool call", "status": "pending" },
      { "description": "WebFetch", "status": "pending" },
      { "description": "WebSearch", "status": "pending" }
    ]
  },
  "status": "in_progress",
  "title": "TodoWrite",
  "toolCallId": "toolu_bdrk_01SojRumNP4KnK5kK3adRvzK",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_01SojRumNP4KnK5kK3adRvzK",
  "title": "TodoWrite",
  "kind": "other"
}
```

### tool_call_update（completed，content 为纯文本摘要）

```json
{
  "content": [
    {
      "content": {
        "text": "Successfully updated the todo list. The current list is now:\n1. [pending] Read a file\n2. [pending] Write a file\n...",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "Successfully updated the todo list. The current list is now:\n1. [pending] Read a file\n...",
  "status": "completed",
  "toolCallId": "toolu_bdrk_01SojRumNP4KnK5kK3adRvzK",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_01SojRumNP4KnK5kK3adRvzK",
  "status": "completed",
  "content": "Successfully updated the todo list. The current list is now:\n1. [pending] Read a file\n..."
}
```

---

## Read（文件读取）

### tool_call_start（尝试读取目录，随后失败）

```json
{
  "content": [],
  "kind": "read",
  "locations": [{ "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace" }],
  "rawInput": { "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace" },
  "status": "in_progress",
  "title": "Read",
  "toolCallId": "toolu_bdrk_01JAPY5PG9cAhsjUBmMmbaBy",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_01JAPY5PG9cAhsjUBmMmbaBy",
  "title": "Read",
  "kind": "read"
}
```

### tool_call_update（failed，rawOutput 含错误信息）

```json
{
  "content": [
    {
      "content": {
        "text": "Error: EISDIR: illegal operation on a directory, read '/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace'",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "Error: EISDIR: illegal operation on a directory, read '/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace'",
  "status": "failed",
  "toolCallId": "toolu_bdrk_01JAPY5PG9cAhsjUBmMmbaBy",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_01JAPY5PG9cAhsjUBmMmbaBy",
  "status": "failed",
  "content": "Error: EISDIR: illegal operation on a directory, read '/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace'"
}
```

### Read（成功读取文件）

```json
{
  "content": [],
  "kind": "read",
  "locations": [
    { "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt" }
  ],
  "rawInput": {
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/test-write.txt"
  },
  "status": "in_progress",
  "title": "Read",
  "toolCallId": "toolu_bdrk_017qkXoxBE6abZTXjw8BCSRN",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_017qkXoxBE6abZTXjw8BCSRN",
  "title": "Read",
  "kind": "read"
}
```

### tool_call_update（completed，rawOutput 含行号+内容）

```json
{
  "content": [
    {
      "content": {
        "text": "1\ttool call trace test - written via write_file tool\n2\tSome initial text that has been edited.\n3\tAnother line.",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "1\ttool call trace test - written via write_file tool\n2\tSome initial text that has been edited.\n3\tAnother line.",
  "status": "completed",
  "toolCallId": "toolu_bdrk_017qkXoxBE6abZTXjw8BCSRN",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_017qkXoxBE6abZTXjw8BCSRN",
  "status": "completed",
  "content": "1\ttool call trace test - written via write_file tool\n2\tSome initial text that has been edited.\n3\tAnother line."
}
```

---

## Write（文件写入）

### tool_call_start

```json
{
  "content": [],
  "kind": "edit",
  "locations": [
    { "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/qoder-trace-test.txt" }
  ],
  "rawInput": {
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/qoder-trace-test.txt",
    "content": "tool call trace test - written by Qoder CLI\nline 2\nline 3\n"
  },
  "status": "in_progress",
  "title": "Write",
  "toolCallId": "toolu_bdrk_0147gwjNGbxF1wLKsD5gyzFV",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_0147gwjNGbxF1wLKsD5gyzFV",
  "title": "Write",
  "kind": "edit"
}
```

### tool_call_update（completed）

```json
{
  "content": [
    {
      "content": {
        "text": "File created successfully at: /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/qoder-trace-test.txt",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "File created successfully at: /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/qoder-trace-test.txt",
  "status": "completed",
  "toolCallId": "toolu_bdrk_0147gwjNGbxF1wLKsD5gyzFV",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_0147gwjNGbxF1wLKsD5gyzFV",
  "status": "completed",
  "content": "File created successfully at: /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/qoder-trace-test.txt"
}
```

---

## Edit（文件编辑）

### tool_call_start

```json
{
  "content": [],
  "kind": "edit",
  "locations": [
    { "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/qoder-trace-test.txt" }
  ],
  "rawInput": {
    "file_path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/qoder-trace-test.txt",
    "instruction": "Append an edited line to mark that the Edit tool was used.",
    "old_string": "line 3\n",
    "new_string": "line 3\nline 4 - edited by Edit tool\n"
  },
  "status": "in_progress",
  "title": "Edit",
  "toolCallId": "toolu_bdrk_01JdRoTptGxvkGoMvcrHriV1",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_01JdRoTptGxvkGoMvcrHriV1",
  "title": "Edit",
  "kind": "edit"
}
```

### tool_call_update（completed，rawOutput 含文件全内容）

```json
{
  "content": [
    {
      "content": {
        "text": "Successfully modified file: /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/qoder-trace-test.txt (1 replacements). Here is the updated code:\ntool call trace test - written by Qoder CLI\nline 2\nline 3\nline 4 - edited by Edit tool\n",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "Successfully modified file: .../qoder-trace-test.txt (1 replacements). Here is the updated code:\ntool call trace test - written by Qoder CLI\nline 2\nline 3\nline 4 - edited by Edit tool\n",
  "status": "completed",
  "toolCallId": "toolu_bdrk_01JdRoTptGxvkGoMvcrHriV1",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_01JdRoTptGxvkGoMvcrHriV1",
  "status": "completed",
  "content": "Successfully modified file: .../qoder-trace-test.txt (1 replacements). Here is the updated code:\n..."
}
```

---

## Glob（文件模式搜索，失败案例）

### tool_call_start

```json
{
  "content": [],
  "kind": "search",
  "locations": [],
  "rawInput": { "pattern": "tool-call-trace/**/*" },
  "status": "in_progress",
  "title": "Glob",
  "toolCallId": "toolu_bdrk_01Eh4NLMUJ7hU7TWHuLX6QXz",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_01Eh4NLMUJ7hU7TWHuLX6QXz",
  "title": "Glob",
  "kind": "search"
}
```

### tool_call_update（failed，ripgrep binary 缺失）

```json
{
  "content": [
    {
      "content": {
        "text": "Error: Error during glob search operation: spawn /Users/tao/.nvm/versions/node/v22.17.0/lib/node_modules/@qoder-ai/vendor/ripgrep/x64-darwin/rg ENOENT",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "Error: Error during glob search operation: spawn .../rg ENOENT",
  "status": "failed",
  "toolCallId": "toolu_bdrk_01Eh4NLMUJ7hU7TWHuLX6QXz",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_01Eh4NLMUJ7hU7TWHuLX6QXz",
  "status": "failed",
  "content": "Error: Error during glob search operation: spawn .../rg ENOENT"
}
```

---

## Grep（内容搜索，失败案例）

### tool_call_start

```json
{
  "content": [],
  "kind": "search",
  "locations": [{ "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace" }],
  "rawInput": {
    "pattern": "tool call trace",
    "path": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace",
    "output_mode": "content"
  },
  "status": "in_progress",
  "title": "Grep",
  "toolCallId": "toolu_bdrk_01SNyQGEnt8be4CH2bXprodK",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_01SNyQGEnt8be4CH2bXprodK",
  "title": "Grep",
  "kind": "search"
}
```

### tool_call_update（completed 但内容为 error，注意 status 是 completed 不是 failed）

```json
{
  "content": [
    {
      "content": {
        "text": "Error during grep search operation: spawn .../rg ENOENT",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "Error during grep search operation: spawn .../rg ENOENT",
  "status": "completed",
  "toolCallId": "toolu_bdrk_01SNyQGEnt8be4CH2bXprodK",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_01SNyQGEnt8be4CH2bXprodK",
  "status": "completed",
  "content": "Error during grep search operation: spawn .../rg ENOENT"
}
```

---

## Bash（Shell 命令执行）

### tool_call_start

```json
{
  "content": [],
  "kind": "execute",
  "locations": [],
  "rawInput": {
    "command": "ls /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/",
    "description": "List tool-call-trace directory contents"
  },
  "status": "in_progress",
  "title": "Bash",
  "toolCallId": "toolu_bdrk_01AbSMvvfK3SeTJgbwMaGeGo",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_01AbSMvvfK3SeTJgbwMaGeGo",
  "title": "Bash",
  "kind": "execute"
}
```

### tool_call_update（completed）

```json
{
  "content": [
    {
      "content": {
        "text": "codex-tool-call-scratch.txt\ndo-not-modify\nqoder-trace-test.txt\ntest-write.txt",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "codex-tool-call-scratch.txt\ndo-not-modify\nqoder-trace-test.txt\ntest-write.txt",
  "status": "completed",
  "toolCallId": "toolu_bdrk_01AbSMvvfK3SeTJgbwMaGeGo",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_01AbSMvvfK3SeTJgbwMaGeGo",
  "status": "completed",
  "content": "codex-tool-call-scratch.txt\ndo-not-modify\nqoder-trace-test.txt\ntest-write.txt"
}
```

---

## Agent（子代理）

### tool_call_start（Explore 子代理）

```json
{
  "content": [],
  "kind": "think",
  "locations": [],
  "rawInput": {
    "subagent_type": "Explore",
    "description": "List tool-call-trace files",
    "prompt": "List all files under /Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/ and return their names. Quick search only."
  },
  "status": "in_progress",
  "title": "Agent",
  "toolCallId": "toolu_bdrk_018S1DAhMC3wLoLfGyZKSsDw",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_018S1DAhMC3wLoLfGyZKSsDw",
  "title": "Agent",
  "kind": "think"
}
```

### 子代理内嵌 tool*call（Glob，toolCallId 格式 call_function*<id>\_<seq>）

```json
{
  "content": [],
  "kind": "search",
  "locations": [],
  "rawInput": { "pattern": "/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/**/*" },
  "status": "in_progress",
  "title": "Glob",
  "toolCallId": "call_function_ofmnplc4a9de_1",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "call_function_ofmnplc4a9de_1",
  "title": "Glob",
  "kind": "search"
}
```

### 子代理内嵌 Glob（failed，ripgrep 缺失）

```json
{
  "content": [
    {
      "content": {
        "text": "Error: Error during glob search operation: spawn .../rg ENOENT",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "Error: Error during glob search operation: spawn .../rg ENOENT",
  "status": "failed",
  "toolCallId": "call_function_ofmnplc4a9de_1",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "call_function_ofmnplc4a9de_1",
  "status": "failed",
  "content": "Error: Error during glob search operation: spawn .../rg ENOENT"
}
```

### Agent tool_call_update（completed，内容为子代理最终输出）

````json
{
  "content": [
    {
      "content": {
        "text": "\n\nI was unable to list the directory contents. All my search tools (Glob, Grep) failed with the same error:\n\n```\nspawn .../rg ENOENT\n```\n\nThe bundled ripgrep binary...",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "\n\nI was unable to list the directory contents...",
  "status": "completed",
  "toolCallId": "toolu_bdrk_018S1DAhMC3wLoLfGyZKSsDw",
  "sessionUpdate": "tool_call_update"
}
````

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_018S1DAhMC3wLoLfGyZKSsDw",
  "status": "completed",
  "content": "\n\nI was unable to list the directory contents..."
}
```

---

## WebFetch（网页获取，失败案例）

### tool_call_start

```json
{
  "content": [],
  "kind": "fetch",
  "locations": [],
  "rawInput": {
    "url": "https://example.com",
    "prompt": "Return the page title and first paragraph."
  },
  "status": "in_progress",
  "title": "WebFetch",
  "toolCallId": "toolu_bdrk_016rt6xdFYgNU3RGLzXZvTdV",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_016rt6xdFYgNU3RGLzXZvTdV",
  "title": "WebFetch",
  "kind": "fetch"
}
```

### tool_call_update（failed，正则解析错误）

```json
{
  "content": [
    {
      "content": {
        "text": "Error: Error during web fetch for \"https://example.com\": Invalid regular expression: .../: Range out of order in character class",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "Error: Error during web fetch for \"https://example.com\": Invalid regular expression...",
  "status": "failed",
  "toolCallId": "toolu_bdrk_016rt6xdFYgNU3RGLzXZvTdV",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_016rt6xdFYgNU3RGLzXZvTdV",
  "status": "failed",
  "content": "Error: Error during web fetch for \"https://example.com\": Invalid regular expression..."
}
```

---

## WebSearch（网络搜索）

### tool_call_start

```json
{
  "content": [],
  "kind": "search",
  "locations": [],
  "rawInput": { "query": "electron vite 2025" },
  "status": "in_progress",
  "title": "WebSearch",
  "toolCallId": "toolu_bdrk_01GYTNCG116UCVsmdefhgDZ4",
  "sessionUpdate": "tool_call"
}
```

映射输出：

```json
{
  "type": "tool_call_start",
  "toolCallId": "toolu_bdrk_01GYTNCG116UCVsmdefhgDZ4",
  "title": "WebSearch",
  "kind": "search"
}
```

### tool_call_update（completed，rawOutput 含搜索结果链接列表）

```json
{
  "content": [
    {
      "content": {
        "text": "Web search results for query: \"electron vite 2025\"\n\nLinks: [{\"title\":\"Modern tooling in 2025? : r/electronjs - Reddit\",\"url\":\"https://www.reddit.com/r/electronjs/comments/1jfvx3i/modern_tooling_in_2025/\"},{\"title\":\"electron-vite | Next Generation Electron Build Tooling\",\"url\":\"https://electron-vite.org/\"},...]\n\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.",
        "type": "text"
      },
      "type": "content"
    }
  ],
  "rawOutput": "Web search results for query: \"electron vite 2025\"\n\nLinks: [...]\n\nREMINDER: You MUST include the sources above in your response...",
  "status": "completed",
  "toolCallId": "toolu_bdrk_01GYTNCG116UCVsmdefhgDZ4",
  "sessionUpdate": "tool_call_update"
}
```

映射输出：

```json
{
  "type": "tool_call_update",
  "toolCallId": "toolu_bdrk_01GYTNCG116UCVsmdefhgDZ4",
  "status": "completed",
  "content": "Web search results for query: \"electron vite 2025\"\n\nLinks: [...]"
}
```
