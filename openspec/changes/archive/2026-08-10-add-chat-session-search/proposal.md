## Why

Chat 侧栏目前只能按更新时间浏览会话；当历史会话增多，用户即使记得讨论关键词，也难以定位目标会话。新增 Workspace 内的历史会话全文搜索，让用户可以从标题、Session ID 或实际对话正文快速返回已有上下文。

## What Changes

- 在 Chat 侧栏“新建会话”操作旁增加带 tooltip 与无障碍名称的搜索 icon button，点击打开 Nuxt UI Modal。
- Modal 自动聚焦搜索输入框；用户输入非空关键词后展示匹配会话，并覆盖初始提示、加载、无结果与失败状态。
- 搜索范围限定为当前 Workspace 的会话标题、Session ID，以及 User/Assistant 消息中的可见正文；明确排除 reasoning、Tool 输入输出与 `<system-reminder>` 内容。
- 搜索结果展示会话标题、首次正文命中片段和更新时间；标题或 Session ID 命中时允许没有正文片段。
- 点击结果后关闭 Modal，并复用既有 `useOpenChatSession()` 流程打开目标会话。
- 新增 Workspace-scoped 的 Session 搜索 IPC 契约和 Main 查询服务；V1 按需读取现有 Session meta/JSONL，不新增索引、缓存文件或持久化格式。

## Capabilities

### New Capabilities

- `chat-session-search`: 定义 Chat 搜索入口、Modal 状态、Workspace 内全文匹配范围、结果排序与会话打开行为。

### Modified Capabilities

无。

## Impact

- Main：Session chat service 与存储读取链路新增只读搜索用例。
- IPC：`session:chat` 新增输入 schema、channel、handler、preload API 与 renderer wrapper。
- Renderer：ChatSidebar 操作区、搜索 Modal 和本地异步查询状态。
- 测试：补充 Main service/IPC、preload/API wrapper、Modal/ChatSidebar 交互与搜索语义覆盖。
- 不新增依赖，不改变 Session meta、消息 JSONL 或既有会话列表、置顶和打开会话契约。
