# opencode Tool Call Trace

## 特征摘要

- 所有 tool_call 的 `status` 为 `"pending"`（与 claude-acp 相同，与其他 agent 不同）
- `rawInput` 在 `tool_call` 起始事件时为空 `{}`，参数通过首次 `tool_call_update` 揭示（二阶段揭示，同 claude-acp）
- toolCallId 格式为 `call_<seq>_<random>`（如 `call_00_yqPSwYB1yE9wJB4RRCaE2143`），seq 从 00 开始
- 大量 `agent_thought_chunk` 穿插在 tool_call 之间（opencode 为推理模型，思考过程以 streaming 方式输出）
- tool_call_update 有多次：第一次揭示 input（status: in_progress），中间可能有内容流更新，最后一次含 rawOutput 且 status 转为 completed/failed
- grep/glob 工具因依赖 ripgrep 下载而 failed（`Transport error`），rawOutput 含 `error` 字段
- write 工具 kind 为 `"edit"`（与 read 不同，opencode 将 write 归类为 edit）
- task（sub-agent）工具 kind 为 `"think"`

---

### Execute（bash）

```
← tool_call {
  "kind": "execute",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "bash",
  "toolCallId": "call_00_yqPSwYB1yE9wJB4RRCaE2143",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_00_yqPSwYB1yE9wJB4RRCaE2143","title":"bash","kind":"execute"}

← tool_call_update {
  "kind": "execute",
  "locations": [],
  "rawInput": {"command":"ls tool-call-trace/","description":"Check if tool-call-trace dir exists"},
  "status": "in_progress",
  "title": "bash",
  "toolCallId": "call_00_yqPSwYB1yE9wJB4RRCaE2143",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_00_yqPSwYB1yE9wJB4RRCaE2143","status":"in_progress","input":{"command":"ls tool-call-trace/","description":"Check if tool-call-trace dir exists"}}

← tool_call_update {
  "content": [{"content":{"text":"codex-tool-call-scratch.txt\ndo-not-modify\n...","type":"text"},"type":"content"}],
  "kind": "execute",
  "locations": [],
  "rawInput": {"command":"ls tool-call-trace/","description":"Check if tool-call-trace dir exists"},
  "status": "in_progress",
  "title": "bash",
  "toolCallId": "call_00_yqPSwYB1yE9wJB4RRCaE2143",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_00_yqPSwYB1yE9wJB4RRCaE2143","status":"in_progress","input":{...},"content":"codex-tool-call-scratch.txt\ndo-not-modify\n..."}

← tool_call_update {
  "content": [{"content":{"text":"codex-tool-call-scratch.txt\n..."},"type":"content"}],
  "kind": "execute",
  "rawInput": {"command":"ls tool-call-trace/","description":"..."},
  "rawOutput": {
    "output": "codex-tool-call-scratch.txt\ndo-not-modify\nqoder-trace-test.txt\ntest-write.txt\n",
    "metadata": {"output":"...","exit":0,"description":"Check if tool-call-trace dir exists","truncated":false}
  },
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_00_yqPSwYB1yE9wJB4RRCaE2143","status":"completed","input":{...},"content":"codex-tool-call-scratch.txt\n..."}
```

**特点：**

- `rawInput` 包含 `command`（shell 命令字符串，非数组）和 `description`
- rawOutput 包含 `output`（stdout 字符串）+ `metadata.exit`
- 共 4 次事件：pending start → in_progress (input reveal) → in_progress (content stream) → completed (rawOutput)
- 最后一次 completed 更新不携带 `toolCallId`，依赖上下文

---

### Read（read 工具）

```
← tool_call {
  "kind": "read",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "read",
  "toolCallId": "call_00_TA85xb1p9usr62kXOYaH1561",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_00_TA85xb1p9usr62kXOYaH1561","title":"read","kind":"read"}

← tool_call_update {
  "kind": "read",
  "locations": [{"path":"/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/do-not-modify"}],
  "rawInput": {"filePath":"/Users/tao/Work/Fio/projects/FylloCode/tool-call-trace/do-not-modify"},
  "status": "in_progress",
  "title": "read",
  "toolCallId": "call_00_TA85xb1p9usr62kXOYaH1561",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_00_TA85xb1p9usr62kXOYaH1561","status":"in_progress","input":{"filePath":"..."}}

← tool_call_update {
  "content": [{"content":{"text":"claude-acp.txt\ncodex-acp.txt\ngemini.txt\nopencode.txt\nqodercli.txt","type":"text"},"type":"content"}],
  "kind": "read",
  "rawInput": {"filePath":"..."},
  "rawOutput": {
    "output": "<path>/Users/tao/.../do-not-modify\n...",
    "metadata": {...}
  },
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_00_TA85xb1p9usr62kXOYaH1561","status":"completed","input":{"filePath":"..."},"content":"claude-acp.txt\ncodex-acp.txt\ngemini.txt\nopencode.txt\nqodercli.txt"}
```

**特点：**

- `rawInput.filePath`（单一字符串，非数组）
- 读取目录时返回目录内容列表

---

### Glob（search，失败案例）

```
← tool_call {
  "kind": "search",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "glob",
  "toolCallId": "call_01_vvRNbVIarHNAg63DIBqM3150",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_01_vvRNbVIarHNAg63DIBqM3150","title":"glob","kind":"search"}

← tool_call_update {
  "kind": "search",
  "locations": [{"path":"/Users/tao/Work/Fio/projects/FylloCode"}],
  "rawInput": {"pattern":"*.md","path":"/Users/tao/Work/Fio/projects/FylloCode"},
  "status": "in_progress",
  "title": "glob",
  "toolCallId": "call_01_vvRNbVIarHNAg63DIBqM3150",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_01_vvRNbVIarHNAg63DIBqM3150","status":"in_progress","input":{"pattern":"*.md","path":"..."}}

← tool_call_update {
  "content": [{"content":{"text":"Transport error (GET https://github.com/BurntSushi/ripgrep/releases/download/15.1.0/ripgrep-15.1.0-x86_64-apple-darwin.tar.gz)","type":"text"},"type":"content"}],
  "kind": "search",
  "rawInput": {"pattern":"*.md","path":"..."},
  "rawOutput": {"error":"Transport error (GET ...)","metadata":{...}},
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_01_vvRNbVIarHNAg63DIBqM3150","status":"failed","input":{"pattern":"*.md","path":"..."},"content":"Transport error (GET ...)"}
```

**特点：**

- `rawInput.pattern` + `rawInput.path`
- 失败时 rawOutput 含 `error` 字段（字符串），acp-mapper 输出 `status: "failed"`（与 qodercli 的 completed-but-error 不同）

---

### Grep（search，失败案例）

```
← tool_call {
  "kind": "search",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "grep",
  "toolCallId": "call_02_id2aeK1wDYhz0PB6R70Q8480",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_02_id2aeK1wDYhz0PB6R70Q8480","title":"grep","kind":"search"}

← tool_call_update {
  "kind": "search",
  "rawInput": {"pattern":"FylloCode","include":"*.md","path":"/Users/tao/.../FylloCode"},
  "status": "in_progress",
  "toolCallId": "call_02_id2aeK1wDYhz0PB6R70Q8480",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_02_id2aeK1wDYhz0PB6R70Q8480","status":"in_progress","input":{"pattern":"FylloCode","include":"*.md","path":"..."}}

← tool_call_update {
  "content": [{"content":{"text":"Transport error (GET ...)"},"type":"content"}],
  "rawOutput": {"error":"Transport error (GET ...)"},
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_02_id2aeK1wDYhz0PB6R70Q8480","status":"failed","input":{...},"content":"Transport error (GET ...)"}
```

**特点：**

- `rawInput.pattern` + `rawInput.include`（glob filter）+ `rawInput.path`
- 同 glob，因 ripgrep 依赖缺失而 failed

---

### WebFetch（webfetch）

```
← tool_call {
  "kind": "fetch",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "webfetch",
  "toolCallId": "call_04_Yn7gwmojmfxBNiDCrKy30133",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_04_Yn7gwmojmfxBNiDCrKy30133","title":"webfetch","kind":"fetch"}

← tool_call_update {
  "kind": "fetch",
  "rawInput": {"url":"https://example.com","format":"text","timeout":10},
  "status": "in_progress",
  "toolCallId": "call_04_Yn7gwmojmfxBNiDCrKy30133",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_04_Yn7gwmojmfxBNiDCrKy30133","status":"in_progress","input":{"url":"https://example.com","format":"text","timeout":10}}

← tool_call_update {
  "content": [{"content":{"text":"Example DomainExample Domain..."},"type":"content"}],
  "kind": "fetch",
  "rawInput": {"url":"https://example.com","format":"text","timeout":10},
  "rawOutput": {"output":"Example Domain...","metadata":{...}},
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_04_Yn7gwmojmfxBNiDCrKy30133","status":"completed","input":{"url":"https://example.com","format":"text","timeout":10},"content":"Example Domain..."}
```

**特点：**

- `rawInput.url` + `rawInput.format` + `rawInput.timeout`
- `kind: "fetch"`

---

### MCP Tool（fyllo-specs_explore）

```
← tool_call {
  "kind": "other",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "fyllo-specs_explore",
  "toolCallId": "call_05_qwPV6iubFYnv8f4scDoh7782",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_05_qwPV6iubFYnv8f4scDoh7782","title":"fyllo-specs_explore","kind":"other"}

← tool_call_update {
  "kind": "other",
  "rawInput": {"targetPath":"/Users/tao/Work/Fio/projects/FylloCode","includeInstruction":false},
  "status": "in_progress",
  "toolCallId": "call_05_qwPV6iubFYnv8f4scDoh7782",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_05_qwPV6iubFYnv8f4scDoh7782","status":"in_progress","input":{"targetPath":"...","includeInstruction":false}}

← tool_call_update {
  "content": [{"content":{"text":"{\"projectRoot\":\"...\",\"activeChanges\":[...]}"},"type":"content"}],
  "kind": "other",
  "rawInput": {"targetPath":"...","includeInstruction":false},
  "rawOutput": {"output":"...","metadata":{...}},
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_05_qwPV6iubFYnv8f4scDoh7782","status":"completed","input":{...},"content":"{\"projectRoot\":\"...\"}"}
```

**特点：**

- title 格式为 `<server>_<tool>`（下划线分隔，与 codex-acp 的 `server/tool` 不同）
- rawInput 直接为工具参数（无 server/tool 包装）
- `kind: "other"`

---

### MCP Tool（fyllo-skills_guidelines）

```
← tool_call {
  "kind": "other",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "fyllo-skills_guidelines",
  "toolCallId": "call_06_hrk9qzR3fDHJnxE8AQEt3224",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_06_hrk9qzR3fDHJnxE8AQEt3224","title":"fyllo-skills_guidelines","kind":"other"}

← tool_call_update {
  "kind": "other",
  "rawInput": {"mode":"read"},
  "status": "in_progress",
  "toolCallId": "call_06_hrk9qzR3fDHJnxE8AQEt3224",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_06_hrk9qzR3fDHJnxE8AQEt3224","status":"in_progress","input":{"mode":"read"}}

← tool_call_update {
  "content": [{"content":{"text":"{\"guidelines\":[...]}"},"type":"content"}],
  "kind": "other",
  "rawInput": {"mode":"read"},
  "rawOutput": {"output":"..."},
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_06_hrk9qzR3fDHJnxE8AQEt3224","status":"completed","input":{"mode":"read"},"content":"{\"guidelines\":[...]}"}
```

---

### Write（write 工具，kind: edit）

```
← tool_call {
  "kind": "edit",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "write",
  "toolCallId": "call_01_Haa9q201bS0qI4OIrUTd3274",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_01_Haa9q201bS0qI4OIrUTd3274","title":"write","kind":"edit"}

← tool_call_update {
  "kind": "edit",
  "locations": [{"path":"/Users/tao/.../tool-call-trace/demo.txt"}],
  "rawInput": {
    "filePath": "/Users/tao/.../tool-call-trace/demo.txt",
    "content": "Hello from tool-call-trace demo\nThis file was created by the write tool.\n"
  },
  "status": "in_progress",
  "title": "write",
  "toolCallId": "call_01_Haa9q201bS0qI4OIrUTd3274",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_01_Haa9q201bS0qI4OIrUTd3274","status":"in_progress","input":{"filePath":"...","content":"..."}}

← tool_call_update {
  "content": [{"content":{"text":"Wrote file successfully."},"type":"content"}],
  "kind": "edit",
  "rawInput": {"filePath":"...","content":"..."},
  "rawOutput": {"output":"Wrote file successfully.","metadata":{...}},
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_01_Haa9q201bS0qI4OIrUTd3274","status":"completed","input":{"filePath":"...","content":"..."},"content":"Wrote file successfully."}
```

**特点：**

- title 为 `"write"` 但 kind 为 `"edit"`（opencode 将写入统一归为 edit 类）
- `rawInput.filePath` + `rawInput.content`（完整文件内容）

---

### Edit（edit 工具）

```
← tool_call {
  "kind": "edit",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "edit",
  "toolCallId": "call_00_l2BwoZiOlPrF1PXQYTKC7321",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_00_l2BwoZiOlPrF1PXQYTKC7321","title":"edit","kind":"edit"}

← tool_call_update {
  "kind": "edit",
  "locations": [{"path":"/Users/tao/.../tool-call-trace/demo.txt"}],
  "rawInput": {
    "filePath": "/Users/tao/.../tool-call-trace/demo.txt",
    "oldString": "This file was created by the write tool.",
    "newString": "This file was created by the write tool.\nThis line was added by the edit tool."
  },
  "status": "in_progress",
  "toolCallId": "call_00_l2BwoZiOlPrF1PXQYTKC7321",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_00_l2BwoZiOlPrF1PXQYTKC7321","status":"in_progress","input":{"filePath":"...","oldString":"...","newString":"..."}}

← tool_call_update {
  "content": [
    {"content":{"text":"Edit applied successfully."},"type":"content"},
    {"newText":"This file was created by the write tool.\nThis line was added by the edit tool.","oldText":"This file was created by the write tool.","path":"...","type":"diff"}
  ],
  "kind": "edit",
  "rawInput": {"filePath":"...","oldString":"...","newString":"..."},
  "rawOutput": {...},
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_00_l2BwoZiOlPrF1PXQYTKC7321","status":"completed","input":{...},"content":"Edit applied successfully."}
```

**特点：**

- `rawInput.filePath` + `rawInput.oldString` + `rawInput.newString`（字符串替换模式）
- completed 时 content 数组含两项：文本结果 + diff 对象（含 `newText/oldText/path/type:"diff"`）

---

### Task / Sub-Agent（kind: think）

```
← tool_call {
  "kind": "think",
  "locations": [],
  "rawInput": {},
  "status": "pending",
  "title": "task",
  "toolCallId": "call_01_qhLu17THd115yGhBrvzw4770",
  "sessionUpdate": "tool_call"
}
→ {"type":"tool_call_start","toolCallId":"call_01_qhLu17THd115yGhBrvzw4770","title":"task","kind":"think"}

← tool_call_update {
  "kind": "think",
  "rawInput": {
    "description": "Tool call trace subagent",
    "subagent_type": "general",
    "prompt": "You are a subagent in a tool-call-trace test. Please do the following:\n1. Use the glob tool to find all .txt files under tool-call-trace/..."
  },
  "status": "in_progress",
  "toolCallId": "call_01_qhLu17THd115yGhBrvzw4770",
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_01_qhLu17THd115yGhBrvzw4770","status":"in_progress","input":{"description":"...","subagent_type":"general","prompt":"..."}}

← tool_call_update (second in_progress, same rawInput)
→ {"type":"tool_call_update","toolCallId":"call_01_qhLu17THd115yGhBrvzw4770","status":"in_progress","input":{...}}

← tool_call_update {
  "content": [{"content":{"text":"<task id=\"ses_14f543251ffe6Ef1HaAYR2M2yr\" state=\"completed\">\n<task_result>\n匹配的 `.txt` 文件..."},"type":"content"}],
  "kind": "think",
  "rawInput": {"description":"...","subagent_type":"general","prompt":"..."},
  "rawOutput": {...},
  "sessionUpdate": "tool_call_update"
}
→ {"type":"tool_call_update","toolCallId":"call_01_qhLu17THd115yGhBrvzw4770","status":"completed","input":{...},"content":"<task id=\"...\" state=\"completed\"><task_result>..."}
```

**特点：**

- `kind: "think"`，title 为 `"task"`
- rawInput 含 `description`、`subagent_type`（"general"）、`prompt`（完整子任务指令）
- rawOutput content 为 `<task id="..." state="completed"><task_result>...</task_result></task>` XML 格式
- 与 claude-acp 的 `plan` 事件不同，opencode sub-agent 是标准 tool_call 流，kind 为 think
- 子 agent 的内部 tool_call 不会透传到父级 ACP 流中
