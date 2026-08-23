## Context

父Chat Session已经持久化不可变`SessionWorkspaceSnapshot`。`SpawnedSessionManager.executeTurn()`当前在新建和续聊前都读取该父snapshot，对完整snapshot调用`assertAgentWorkspaceCompatibility()`，并把同一`cwd/additionalDirectories`交给`AcpSession`。因此multi-root父Session遇到不支持ACP `additionalDirectories`的Agent时会在发送prompt前失败；现有代码没有安全的单Folder选择入口。

`SpawnedSessionMeta`已经持久化effective `workspaceSnapshot`，但没有记录该形状是“默认继承整个Workspace”还是“调用方显式选择Folder”。单Folder Workspace和显式Folder scope都只有一个Folder，不能靠数组长度恢复该语义。Renderer list/detail summary目前也不包含scope，详情Slideover只能展示Agent和Turn状态。

约束如下：

- caller只能从可信MCP request context取得Workspace和父Session identity；绝对path不是授权事实。
- 默认行为必须继续继承完整父snapshot；不得为了兼容单根Agent静默选择primary。
- spawned Session continuation固定复用创建时的Agent、process generation、ACP Session和Workspace授权。
- 旧meta必须继续可读，不能增加离线migration或启动期批量改写。
- list仍保持轻量，不得因scope展示读取完整messages或response文件。

## Goals / Non-Goals

**Goals:**

- 让首次`prompt_to_agent`通过可选`folderId`显式收窄到父snapshot内一个Folder。
- 在compatibility gate之前得到最终effective snapshot，使不支持additional directories的Agent可运行单Folder任务。
- 用可执行字段description和错误文案告诉Agent如何从multi-root mismatch恢复。
- 持久化`workspace | folder` scope及创建时名称，并在owner-scoped inspection与详情Slideover中展示。
- 保持旧记录、默认调用、后台执行、响应读取和安全边界兼容。

**Non-Goals:**

- 不接受绝对`cwd`、相对子目录、glob或多个`folderId`。
- 不让continuation切换scope，不自动拆分跨Folder任务，也不修改普通Chat/probe的Agent picker行为。
- 不在`available_agents`中新增或主动探测capability字段。
- 不把effective snapshot、cwd或Folder path暴露给renderer。
- 不修改spawn并发、watchdog、notification、Signal、permission或bundled MCP注入策略。

## Decisions

### 1. 公共输入使用`folderId`而不是`cwd`

在`src/shared/types/fyllo-spawn-rpc.ts#promptToAgentParamsSchema`增加optional `folderId`，并为`folderId`与`sessionId`增加Agent-facing Zod description。Schema继续允许两字段同时解析，再由Main返回结构化`SPAWN_INVALID_REQUEST`，确保错误能包含“续聊删除folderId / 新建删除sessionId”的恢复步骤，而不是只得到MCP通用invalid-params文本。

`folderId`只与父Session固定snapshot中的identity比较；Main不按path、当前Workspace成员或名称查找。相比直接接受`cwd`，该选择既能解决single-root Agent兼容问题，也不会扩大父Agent授权。

### 2. 在compatibility gate之前确定effective snapshot

新增纯helper（建议`src/main/domain/session/spawn/spawned-session-workspace.ts`）集中实现：

- 从父`SessionWorkspaceSnapshot`按`folderId`派生单Folder snapshot；保留父`workspaceId/workspaceKind`，把所选Folder设为唯一Folder和primary，将其path投影为`cwd`并设置空`additionalDirectories`。
- 校验持久化scope/effective snapshot仍是父snapshot的完整继承或单Folder子集，Folder identity与snapshot path必须一致。
- 格式化授权Folder的`folderId + folderName`选择列表，错误不得包含path。

`SpawnedSessionManager.executeTurn()`调整顺序：

1. 重新校验并加载父snapshot。
2. 加载/判定新建或continuation。
3. 新建时按optional `folderId`派生effective snapshot与scope；续聊时拒绝`folderId`并使用meta中已持久化的scope/snapshot。
4. 对effective snapshot调用`assertAgentWorkspaceCompatibility()`。
5. 只有通过后才acquire AgentProcess、写meta/turn/message并发送prompt。

默认新建的effective snapshot仍是完整父snapshot。Folder-scoped continuation不再拿父完整snapshot做capability gate或传给`AcpSession`，否则第二轮会重新失败并丢失创建时scope。

### 3. Meta保存显式discriminated scope，旧记录读取时归一化

在共享spawn类型中定义：

- `{ kind: "workspace", workspaceId, name }`
- `{ kind: "folder", folderId, name }`

新建workspace scope时通过`@main/services/workspace/_public#resolveWorkspace()`取得创建时Workspace名称；Folder scope名称只取父snapshot中匹配Folder的`folderName`。Meta继续保存effective `workspaceSnapshot`，scope只表达选择语义和稳定展示信息，不替代路径授权。

磁盘`storedMetaSchema`保持version 1并兼容optional scope；load时统一归一化为内存required scope。旧记录固定解释为`workspace`，名称优先取当前可信Workspace metadata，解析失败时使用明确`Workspace` fallback，不写回磁盘。这样避免迁移和错误地把历史单根记录解释为显式Folder选择。

### 4. 错误仍使用现有code，但message必须可恢复

保留`PROMPT_CAPABILITY_MISMATCH`和`SPAWN_INVALID_REQUEST`，不扩大RPC error union。相关message使用英文Agent-facing文案并包含：原因、`No spawned Session was created`或`No new turn was started`、允许的Folder ID/名称、下一次`prompt_to_agent`应省略/增加的字段，以及多Folder任务应选择支持additional directories Agent的替代方案。

`retryable`不设为true，因为原样重试仍会失败；message明确要求改变参数。MCP `toolFailure()`已原样返回Main error message，无需增加第二套错误映射。

### 5. Inspection只投影精简scope，Slideover在Session header展示

`src/shared/ipc/session/spawned-session.schemas.ts#spawnedSessionSummarySchema`增加required scope，复用共享discriminated schema。`SpawnedSessionQueryService.buildSummary()`只从归一化meta投影scope，因此list/detail一致且不增加messages读取。

`SpawnedSessionDetailSlideover.vue`在现有Agent信息附近增加Session级scope行，使用既有semantic icon registry中的Workspace/Folder语义（缺少时补充稳定语义映射），文字分别为`Workspace · name`与`Folder · name`。scope不进入Turn selector，也不在loading/not_found时猜测。活动栏列表本次不增加scope，以保持紧凑；详情是权威解释入口。

### 6. 文档与版本按bundled MCP规则更新

更新`src/mcp-servers/fyllo-spawn/README.md`、`CHANGELOG.md`和`src/version.ts`的patch版本，说明新增optional字段、默认完整继承、continuation限制与capability mismatch恢复方式。RPC envelope version保持1：Main与bundled child同版本交付，新增字段optional，现有结果union与五个tools不变。

## Risks / Trade-offs

- [续聊误用父完整snapshot导致scope回退] → continuation必须先加载meta，并只用持久化effective snapshot做compatibility与`AcpSession`输入；增加两轮Folder-scoped测试。
- [caller通过folderId扩大授权] → 只匹配父固定snapshot identity/path，不查询当前Workspace新增成员，不接受path；增加未知Folder测试。
- [错误在MCP schema层提前被拦截而失去恢复文案] → 不用schema refinement拒绝`folderId + sessionId`，由Main返回结构化错误。
- [旧meta缺少scope导致inspection失败] → 存储读取归一化为workspace scope并提供名称fallback，保持version 1兼容测试。
- [Workspace或Folder之后重命名造成历史含义漂移] → 新记录持久化创建时名称；不在每次query覆盖。旧记录只能使用当前名称或fallback，这是无迁移兼容的已知限制。
- [错误列出Folder过多] → Workspace当前最多16个Folder，使用紧凑`id (name)`列表且不包含path。
- [Renderer泄露授权路径] → IPC scope schema不包含path，UI只显示类型与名称。

## Migration Plan

1. 先落 shared schema、scope helper和meta兼容读取，使旧记录继续可读。
2. 调整manager新建/续聊顺序与错误文案，再接入query projection和Slideover。
3. 更新MCP文档/version并运行focused Main、MCP、renderer测试以及typecheck/lint/format质量门。
4. 回滚时可移除新输入与UI；已写meta中的optional scope会被旧strict schema拒绝，因此发布后代码回滚必须同时保留scope字段兼容解析，或先发布兼容reader。正常前向升级无需数据migration。

## Open Questions

无。字段、默认值、错误恢复、持久化兼容与UI展示范围均已确认。
