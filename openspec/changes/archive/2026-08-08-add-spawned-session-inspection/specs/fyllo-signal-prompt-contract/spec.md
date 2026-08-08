## ADDED Requirements

### Requirement: spawn.session contract只携带opaque Session查询键

Shared Fyllo Signal registry SHALL启用`spawn.session`，其payload SHALL是strict object`{ "sessionId": string }`。`sessionId`长度 SHALL为1到256，且 SHALL拒绝`/`、`\\`或NUL；schema SHALL拒绝`workspaceId`、`parentSessionId`、`agentId`、`label`、status、content、responseId、path及任何其他字段。

Prompt metadata SHALL说明该payload只是用于打开spawned Session详情的opaque查询键，不是Workspace、父Session、Agent、状态、内容或授权事实。Example SHALL由registry提供并通过JSON parser与payload schema。

#### Scenario: 最小spawn.session payload可解析

- **WHEN** contract example只包含合法`sessionId`
- **THEN** shared semantic parser SHALL返回typed ready `spawn.session` payload
- **AND** generated prompt SHALL把`sessionId`列为唯一required field

#### Scenario: Agent尝试携带展示或授权字段

- **WHEN** payload附加agentId、label、workspaceId、parentSessionId、responseId或path
- **THEN** strict payload schema SHALL拒绝该Signal
- **AND** Renderer SHALL走通用invalid Signal fallback而不查询目标

### Requirement: spawn.session只在prompt_to_agent新建调用后输出一次

`spawn.session` prompt contract SHALL指导父Agent：仅当本次`prompt_to_agent`输入省略`sessionId`且tool结果包含新建spawned Session的`sessionId`时，在assistant text中输出一个`spawn.session`。该规则 SHALL同时覆盖同步和`background=true`的新建调用；continuation调用、capacity结果以及不包含Session identity的RPC失败 SHALL不输出。

同一新建调用在同一assistant response中 SHALL最多输出一次该Session Signal。Signal SHALL继续遵守公共standalone block、空白行、strict JSON和literal example规则。

#### Scenario: Background新建被accepted

- **WHEN** 父Agent以省略sessionId和`background=true`调用`prompt_to_agent`并收到包含sessionId的accepted结果
- **THEN** prompt contract SHALL指导其在assistant response中输出一次该sessionId的`spawn.session`

#### Scenario: 同步新建完成

- **WHEN** 父Agent以省略sessionId和默认同步模式调用`prompt_to_agent`并收到包含sessionId的terminal结果
- **THEN** prompt contract SHALL指导其输出一次`spawn.session`
- **AND** SHALL不声称该Signal保证在同步turn运行期间已可见

#### Scenario: Continuation不重复输出

- **WHEN** 父Agent向已有sessionId继续调用`prompt_to_agent`
- **THEN** prompt contract SHALL指导其不再输出该Session的创建Signal

#### Scenario: 结果没有Session identity

- **WHEN** `prompt_to_agent`返回capacity_exceeded或顶层RPC error且没有sessionId
- **THEN** prompt contract SHALL指导其不输出`spawn.session`

### Requirement: spawn.session prompt contract保持无副作用语义

Generated Signal contract SHALL明确`spawn.session`即使可点击并显示外部实时状态，Signal标记自身仍不创建任务、不注册状态、不持久化事实、不进入EventRail，也不授予对任何Workspace或父Session的访问权。Agent漏发或重复发出Signal SHALL不被描述为能够创建、重启、继续、取消或复制spawned Session。

#### Scenario: Generated contract描述Signal边界

- **WHEN** 生成完整`<fyllo-signal-contract>`
- **THEN** `spawn.session` metadata SHALL只描述输出时机、opaque payload和展示用途
- **AND** SHALL不声称Signal是spawned Session或notification的事实来源
