# chat-session-search Specification

## Purpose

定义当前 Workspace 历史会话的全文检索能力：覆盖标题、Session ID 与 User/Assistant 可见正文，并约束跨进程隔离、匹配排序、异步查询状态以及从结果打开会话的交互契约。

## Requirements

### Requirement: Chat 侧栏提供会话搜索入口

系统 SHALL 在 ChatSidebar 顶部“新建会话”操作旁提供搜索 icon button。该按钮 SHALL 具有“搜索会话” tooltip、`aria-label` 与可见键盘焦点；点击后 SHALL 打开 Nuxt UI Modal，且 SHALL NOT 改变当前 active Session、草稿内容或侧栏分组状态。

#### Scenario: 打开搜索 Modal

- **WHEN** 用户点击“搜索会话” icon button
- **THEN** 系统 SHALL 打开标题为“搜索会话”的 Modal
- **AND** 搜索输入框 SHALL 自动获得焦点
- **AND** 当前 active Session 与 Chat 临时状态 SHALL 保持不变

#### Scenario: 新建会话操作保持可用

- **WHEN** ChatSidebar 同时展示“新建会话”和“搜索会话”操作
- **THEN** “新建会话” SHALL 继续执行既有 draft Session 初始化流程
- **AND** 搜索入口 SHALL NOT 改变置顶/最近会话分组的排序、折叠或滚动行为

### Requirement: 搜索只查询当前 Workspace 的可见会话文本

系统 SHALL 使用 trim 后的非空关键词，在当前 Workspace 内按大小写不敏感 substring 规则搜索 Session 标题、Session ID 以及 User/Assistant 消息的 text 正文。系统 SHALL NOT 搜索其他 Workspace、reasoning、Tool 名称/输入/输出、非 text part 或 `<system-reminder>…</system-reminder>` 内容。

#### Scenario: 标题或 Session ID 命中

- **WHEN** 关键词是当前 Workspace 某 Session 标题或 Session ID 的大小写不敏感子串
- **THEN** 搜索结果 SHALL 包含该 Session
- **AND** 每个 Session SHALL 最多出现一次

#### Scenario: User 或 Assistant 正文命中

- **WHEN** 关键词只出现在当前 Workspace 某 Session 的 User 或 Assistant text 正文中
- **THEN** 搜索结果 SHALL 包含该 Session
- **AND** 结果 SHALL 提供围绕首次正文命中的单行片段

#### Scenario: 内部内容不参与搜索

- **WHEN** 关键词只出现在 reasoning、Tool 输入输出、非 text part 或 system reminder 区段中
- **THEN** 该内容 SHALL NOT 使对应 Session 出现在搜索结果中

#### Scenario: Workspace 搜索隔离

- **WHEN** Workspace A 与 Workspace B 的会话正文包含相同关键词
- **AND** Workspace A 的窗口发起搜索
- **THEN** 系统 SHALL 只返回 Workspace A 的会话
- **AND** Main SHALL 校验 IPC sender 对 Workspace A 的归属

### Requirement: 搜索 Modal 表达完整异步状态

系统 SHALL 只在 trim 后关键词非空时发起搜索，并 SHALL 在 Modal 中区分初始提示、搜索中、成功结果、无结果与失败状态。输入 SHALL 使用 300ms debounce；同一 Modal SHALL NOT 并行发起多个全文扫描，且迟到响应 SHALL NOT 覆盖更晚的关键词、Workspace 或已关闭 Modal 的状态。

#### Scenario: 空关键词

- **WHEN** Modal 刚打开或输入内容 trim 后为空
- **THEN** 系统 SHALL 展示输入关键词的提示状态
- **AND** SHALL NOT 调用搜索 IPC

#### Scenario: 连续输入关键词

- **WHEN** 用户在 debounce 或既有查询执行期间继续修改关键词
- **THEN** 系统 SHALL 最终只展示最新关键词的结果
- **AND** 旧查询响应 SHALL NOT 覆盖最新状态
- **AND** 同一 Modal SHALL NOT 同时执行多个全文扫描

#### Scenario: 没有匹配会话

- **WHEN** 最新搜索成功且没有匹配结果
- **THEN** Modal SHALL 展示“没有匹配的会话”空状态
- **AND** SHALL 提示用户尝试更换关键词

#### Scenario: 搜索失败

- **WHEN** 最新搜索请求返回错误
- **THEN** Modal SHALL 展示“搜索失败”状态
- **AND** SHALL 提供可执行的重试说明或操作

### Requirement: 搜索结果稳定排序并提供定位信息

系统 SHALL 让标题命中优先于 Session ID 命中，Session ID 命中优先于正文命中；同一命中类别 SHALL 按 Session `updatedAt` 降序排列，并 SHALL 最多返回 50 个结果。每条结果 SHALL 展示会话标题和更新时间；正文命中 SHALL 展示最长 160 字符、空白已归一化且必要时带省略号的首次命中片段。

#### Scenario: 多种命中类型共同出现

- **WHEN** 同一关键词分别命中不同 Session 的标题、Session ID 与正文
- **THEN** 标题命中 SHALL 排在 Session ID 命中之前
- **AND** Session ID 命中 SHALL 排在正文命中之前
- **AND** 同一类别中最近更新的 Session SHALL 排在前面

#### Scenario: 搜索结果超过上限

- **WHEN** 匹配 Session 数量超过 50
- **THEN** 系统 SHALL 只返回排序后的前 50 条

### Requirement: 用户可以从搜索结果打开会话

系统 SHALL 让每条搜索结果成为键盘可聚焦的操作项。用户选择结果时，系统 SHALL 复用既有 `useOpenChatSession()` 流程打开该 Session；成功时 SHALL 关闭 Modal，且 SHALL NOT 修改、置顶、删除或重排 Session 元数据。

#### Scenario: 打开搜索结果

- **WHEN** 用户点击或用键盘激活一条有效搜索结果
- **THEN** 系统 SHALL 关闭搜索 Modal
- **AND** SHALL 在 Chat 页面选中并加载目标 Session
- **AND** SHALL 沿用既有 Chat 临时状态清理与路由兼容行为

#### Scenario: 结果在打开前失效

- **WHEN** 搜索结果对应的 Session 在打开前已删除或无法加载
- **THEN** 系统 SHALL 向用户展示打开失败信息
- **AND** SHALL NOT 静默切换到其他 Session
