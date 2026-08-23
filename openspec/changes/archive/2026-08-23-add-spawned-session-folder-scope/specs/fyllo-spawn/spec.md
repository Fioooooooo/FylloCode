## MODIFIED Requirements

### Requirement: Tool 调用方身份只来自可信 Workspace 请求上下文

fyllo-spawn SHALL 从 Main proxy 注入的 `McpWorkspaceDescriptorV2` 请求上下文取得 `workspaceId` 与父 `fylloSessionId`，并 SHALL NOT 接受 tool 参数、caller header或进程级环境变量覆盖该身份。每次续聊、状态查询和响应读取 SHALL 校验 spawned Session属于同一 `{ workspaceId, parentSessionId }`；不匹配时 SHALL 返回 `not_found`且不泄露目标是否存在。`prompt_to_agent.folderId` SHALL只作为父 Session固定授权 snapshot内的显式Folder选择器， SHALL NOT作为Workspace identity或caller可提交的path。

#### Scenario: Agent 不提供父 Session参数

- **WHEN** Agent 调用 `prompt_to_agent` 且tool input只包含agentId、prompt和可选spawned session、folder、config或background参数
- **THEN** fyllo-spawn SHALL 从可信请求上下文取得父 Session identity
- **AND** Agent SHALL 无需知道或提交父 fylloSessionId

#### Scenario: 请求上下文缺少 Session

- **WHEN**可信 descriptor不包含 sessionId
- **THEN** tool SHALL 返回 `SPAWN_PARENT_SESSION_REQUIRED`
- **AND** SHALL NOT 创建任何内存 entry或磁盘目录

#### Scenario: 跨父 Session猜测 spawned ID

- **WHEN** 当前调用方提交属于其他 Workspace或父 Session的 spawnedSessionId
- **THEN** tool SHALL 返回 `not_found`
- **AND** SHALL NOT返回 activity、error、config、responseId或文件内容

### Requirement: Spawned ACP Session 固定继承父 Chat Session的 multi-root 授权

Main SHALL 根据可信caller identity加载父Chat Session meta并重新校验其固定`SessionWorkspaceSnapshot`。新建调用省略`folderId`时，Main SHALL继续使用完整父snapshot的`cwd`与`additionalDirectories`；新建调用指定`folderId`时，Main SHALL只允许选择父snapshot中完全匹配的Folder identity，并从该Folder派生固定单根snapshot：`cwd`等于其snapshot path、`additionalDirectories`为空、该Folder成为唯一Folder和primary。两种模式都 SHALL在创建前对最终effective snapshot复用现有Agent Workspace compatibility校验并持久化同一snapshot。

续聊 SHALL复用spawned meta中已固定的effective snapshot与scope，不得接受新的`folderId`或恢复为父Session完整scope。Main SHALL NOT使用MCP child回传的path、当前Workspace的新成员集合、任意子目录或primary fallback扩大或改变授权。

#### Scenario: Collection Workspace默认创建 spawned Session

- **WHEN** 父Session snapshot包含primary和两个additional Folder且仍全部有效，调用省略`folderId`
- **THEN** spawned `newSession` SHALL使用snapshot primary path作为cwd
- **AND** SHALL按snapshot顺序传递两个`additionalDirectories`
- **AND** spawned meta SHALL持久化完整父snapshot与`workspace` scope

#### Scenario: Collection Workspace显式选择Folder

- **WHEN** 父Session snapshot包含三个Folder且新建调用指定其中第二个Folder的`folderId`
- **THEN** Main SHALL使用该Folder的snapshot path作为`cwd`并传递空`additionalDirectories`
- **AND** spawned meta SHALL持久化只含该Folder的effective snapshot与`folder` scope
- **AND** SHALL NOT把父primary或其他Folder授权给spawned Agent

#### Scenario: 父 snapshot stale

- **WHEN** 父 Session成员已被移除、缺失或重定位
- **THEN** `prompt_to_agent` SHALL在启动或取得 AgentProcess前返回现有对应 stale error
- **AND** SHALL NOT裁剪snapshot或创建spawned Session

#### Scenario: 目标 Agent不支持默认 multi-root scope

- **WHEN**父snapshot包含`additionalDirectories`、调用未指定`folderId`且目标Agent capability不是supported
- **THEN** `prompt_to_agent` SHALL返回`PROMPT_CAPABILITY_MISMATCH`且说明没有创建Session
- **AND**错误 SHALL列出父snapshot内可选Folder ID与名称，并指导省略`sessionId`、指定一个`folderId`重试
- **AND**任务确需多个Folder时 SHALL指导改用支持additional directories的Agent
- **AND** SHALL NOT发送ACP prompt或隐式回退primary Folder

### Requirement: prompt_to_agent不依赖spawn.session提供用户可观察性

`prompt_to_agent`的Agent-facing description SHALL说明FylloCode通过Main-owned owner-scoped inspection自动发现并更新spawned Sessions，用户可观察性不依赖父Agent输出`spawn.session`。Description SHALL NOT要求新建调用后立即输出Signal，也 SHALL NOT把continuation不输出Signal描述为可观察性缺失。

除增加首次创建专用的可选`folderId`外，该变化 SHALL保持`prompt_to_agent`既有accepted/completed/error结果、五个HTTP-only tools、`responseId + read_response`契约和异步优先指导不变。`spawn.session` MAY继续作为可选上下文详情深链，但tool description SHALL引用shared Signal contract而不复制payload schema、JSON example或Markdown格式规则。

#### Scenario: Tool description说明自动发现

- **WHEN** 父fyllocode Chat获得fyllo-spawn `prompt_to_agent` tool description
- **THEN** description SHALL说明Main-owned inspection自动提供Session发现和状态
- **AND** SHALL不要求父Agent输出Signal才能让用户观察

#### Scenario: 同一Session开始后续Turn

- **WHEN** 父Agent向owner-matched已有sessionId发送第二个Prompt且不提交`folderId`
- **THEN** Main SHALL按既有runtime和已持久化scope创建新Turn，并通过owner-scoped view更新同一Session
- **AND** 用户可观察性 SHALL不依赖新的Signal或MCP event文件

## ADDED Requirements

### Requirement: prompt_to_agent以字段description和可恢复错误指导Folder scope

`prompt_to_agent.folderId`的Agent-facing字段description SHALL明确它是optional、只能在省略`sessionId`的新建调用中使用、只能选择父Session授权snapshot内的Folder、指定后该Folder成为`cwd`且不传additional directories、省略时继承完整父Workspace。`sessionId`字段description SHALL反向明确续聊必须省略`folderId`且既有scope保持固定。Tool description SHALL解释单根Agent在multi-root capability mismatch后可通过新建Folder-scoped Session恢复。

所有与该输入相关的错误 SHALL至少说明失败原因、是否创建了spawned Session、调用方下一步应修改的参数和不能满足时的替代方案。错误 SHALL使用Folder ID和名称指导恢复，不得要求caller提交绝对path；可通过改变参数恢复的错误 SHALL NOT被描述为可原样盲目重试。

#### Scenario: folderId与sessionId同时提交

- **WHEN**调用方同时提交`sessionId`和`folderId`
- **THEN**tool SHALL返回`SPAWN_INVALID_REQUEST`并说明未开始新Turn、既有Session scope不可修改
- **AND**错误 SHALL指导续聊时删除`folderId`，或省略`sessionId`并用`folderId`创建新Session

#### Scenario: folderId不属于父snapshot

- **WHEN**新建调用提交的`folderId`不在父Session固定snapshot中
- **THEN**tool SHALL返回`SPAWN_INVALID_REQUEST`且不创建Session
- **AND**错误 SHALL列出可选Folder ID与名称并指导选择其中一个重试
- **AND** SHALL NOT从当前Workspace registry查找同名或新增Folder

#### Scenario: Agent阅读folderId字段description

- **WHEN**父Agent检查`prompt_to_agent` input schema
- **THEN**`folderId`与`sessionId`字段 SHALL各自说明新建/续聊互斥和scope固定语义
- **AND**父Agent SHALL无需先触发错误才能知道省略`folderId`会继承完整Workspace

### Requirement: Spawned meta持久化显式Workspace或Folder scope

每个新建spawned Session SHALL在既有`workspaceSnapshot`之外持久化discriminated scope：完整继承记录`workspace`及创建时Workspace显示名称，显式Folder选择记录`folder`、`folderId`及创建时Folder显示名称。续聊、错误、过期、应用重启与inspection读取 SHALL保留该Session级scope，不得按最新Turn或当前Workspace primary重新推断。

历史meta缺少scope字段时 SHALL在读取时兼容归一化为`workspace`，不得要求离线批量migration或改写历史记录。该兼容投影 MAY从当前可信Workspace metadata取得显示名称；无法取得时 SHALL使用明确的Workspace fallback标签，不得把单Folder目录形状误报为显式Folder选择。

#### Scenario: 新建完整Workspace scope

- **WHEN**新建调用省略`folderId`
- **THEN**meta SHALL持久化`workspace` scope、创建时Workspace名称和完整effective snapshot
- **AND**后续续聊 SHALL保持同一scope

#### Scenario: 新建单Folder scope

- **WHEN**新建调用指定父snapshot中的Folder
- **THEN**meta SHALL持久化`folder` scope、folderId、创建时Folder名称和单根effective snapshot
- **AND**后续续聊 SHALL继续使用该Folder且不得接受scope变更

#### Scenario: 读取旧版meta

- **WHEN**合法历史meta包含workspaceSnapshot但没有显式scope
- **THEN**存储读取与inspection SHALL将其归一化为`workspace`
- **AND** SHALL不因新增字段把Session投影为损坏或`not_found`
