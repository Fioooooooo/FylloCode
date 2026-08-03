## MODIFIED Requirements

### Requirement: Chat header 区分 Session scope 与当前 Workspace

Chat header SHALL 使用 active Session 的 `SessionWorkspaceSnapshot` 展示 Agent 实际授权 Folder，并 SHALL 将其与当前 Workspace 解析结果的差异归一化为 current-only Folder、snapshot-only Folder、primary 变化与同 ID Folder 显示名称变化。内部 snapshot 与比较继续使用 Folder identity；用户界面 SHALL 将授权 Folder 呈现为 Project、将 primary 呈现为主 Project，并按当前 kind 将顶层对象呈现为 Project 或 Workspace。组件 SHALL NOT 使用当前 Workspace Folder 列表冒充已有 Agent Session 的授权范围。

对于具有固定授权快照的非 draft Session，Chat header SHALL 在右侧操作区提供“Agent 授权范围”icon button，并 SHALL 通过该入口打开 Popover 按 snapshot 顺序展示 Project 数量、名称与项目目录；系统 SHALL NOT 再在消息区域上方常驻展示可展开的授权范围区块。Popover SHALL 将 Project 列表限制在固定最大高度内并只允许纵向滚动，使 1–16 个 Project 均不压缩消息区域且不产生横向滚动。主 Project SHALL 同时使用 primary color dot 与可见“主 Project”文字标识。

icon button SHALL 提供 tooltip、`aria-label`、可见键盘焦点以及与范围状态一致的可感知提示；授权范围与当前 Project/Workspace 不同或已经失效时，提示 SHALL NOT 仅依赖颜色。Popover SHALL 支持通过入口再次点击、显式关闭、点击外部与 `Escape` 收起，并 SHALL 在关闭后将键盘焦点恢复到入口。

#### Scenario: 正常 Session 按需查看固定授权范围

- **WHEN** 用户打开具有 `SessionWorkspaceSnapshot` 且与当前 Project 或 Workspace 一致的非 draft Session
- **THEN** Chat header 右侧 SHALL 显示“Agent 授权范围”icon button
- **AND** 消息区域上方 SHALL NOT 显示常驻 Session scope 展开区块
- **AND** 用户打开 Popover 后 SHALL 看到“Agent 可访问的 Project”、Project 数量、snapshot 中的有序 Project 名称与项目目录
- **AND** Popover SHALL 说明授权范围在 Session 创建时固定

#### Scenario: 16 个 Project 在 Popover 内纵向滚动

- **WHEN** active Session snapshot 包含 16 个 Project，且完整列表高度超过 Popover 列表区域的最大高度
- **THEN** Project 列表 SHALL 在 Popover 内独立纵向滚动
- **AND** Popover 与 ChatContainer SHALL NOT 因列表产生横向滚动
- **AND** Chat 消息区域高度 SHALL NOT 随 Project 列表展开而缩小
- **AND** 截断的 Project 名称或项目目录 SHALL 提供查看完整值的方式

#### Scenario: 主 Project 使用双重标识

- **WHEN** 用户在 Popover 中查看 snapshot 的 `primaryFolderId` 对应 Project
- **THEN** 该 Project SHALL 显示 primary color dot
- **AND** 该 Project SHALL 同时显示可见“主 Project”文字
- **AND** 非 primary Project SHALL NOT 显示该 dot 或文字标识

#### Scenario: Workspace 新增成员后查看旧 Session

- **WHEN** 当前 Workspace 比 active Session snapshot 多一个可用 Folder
- **THEN** Chat header icon button SHALL 在 Popover 打开前提供非纯颜色的范围变化提示
- **AND** Popover SHALL 将该 Folder 标记为当前新增 Project
- **AND** SHALL 提示新建 Session 才能让 Agent 获得该 Project

#### Scenario: Session snapshot 与当前 primary 不同

- **WHEN** Workspace primary 在 Session 创建后发生变化
- **THEN** Chat header SHALL 继续以 snapshot primary 表示当前 Agent `cwd`
- **AND** icon button SHALL 提示当前授权范围与 Project 或 Workspace 不同
- **AND** Popover SHALL 展示当前主 Project 与 snapshot 主 Project 的差异

#### Scenario: Folder 显示名称变化

- **WHEN** 同一 `folderId` 的当前名称与 snapshot `folderName` 不同
- **THEN** Chat header icon button SHALL 提示当前授权范围与 Project 或 Workspace 不同
- **AND** Popover SHALL 以 Project 名称变化呈现该差异而不改写历史 snapshot

#### Scenario: Session 授权范围已失效

- **WHEN** `activeSessionScopeDiff.isStale` 为 true
- **THEN** Chat header icon button SHALL 使用 error 状态 icon 与可访问文字提示授权范围已失效
- **AND** Popover SHALL 在 Project 列表之前展示失效原因与现有逐项差异
- **AND** Popover SHALL 继续展示 snapshot Project，不得替换为当前 Workspace Folder 列表

#### Scenario: draft 或缺少固定快照

- **WHEN** Chat 正在创建 draft Session，或 active Session 没有 `SessionWorkspaceSnapshot`
- **THEN** Chat header SHALL NOT 显示 Agent 授权范围入口
