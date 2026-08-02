## MODIFIED Requirements

### Requirement: 主进程拥有预览路径和项目上下文

系统 SHALL 通过 `workspace.document` domain-first IPC 提供 `preparePreview` 与 `confirmPreview`。主进程 SHALL 从 IPC sender 对应的 `WorkspaceWindowManager` context 取得 `workspaceId`，并通过 Workspace resolver 取得当前 `availableFolders`；SHALL NOT 接受 renderer 提供的 Workspace scope、Folder paths 或 webContents identity。Chat 可提交 `sessionId` 作为 Agent scope comparison context，但该 ID SHALL NOT 参与文件读取授权，且 Main SHALL 验证 Session 属于 sender Workspace。

#### Scenario: Workspace window 发起预览

- **WHEN** workspace window 调用 `preparePreview`
- **THEN** handler SHALL 使用 `event.sender` 解析绑定的 Workspace 上下文
- **AND** SHALL 通过 Workspace resolver 取得当前全部 available Folder identity/path
- **AND** SHALL 在该上下文内判断可信根与授权

#### Scenario: Chat 携带 Session comparison context

- **WHEN** Chat 中的预览请求携带 `sessionId`
- **THEN** Main SHALL 验证该 Session 属于 sender Workspace
- **AND** 文件能否读取 SHALL 仍只由当前 Window/Workspace trusted roots 或 user-confirmed grant 决定

#### Scenario: 无 Workspace 上下文不能读取文件

- **WHEN** launcher window、未知 sender 或已销毁 sender 调用预览 IPC
- **THEN** 系统 SHALL 返回受控错误
- **AND** SHALL NOT stat 或读取请求路径的文件内容

#### Scenario: Renderer 不能用确认接口替换路径

- **WHEN** renderer 调用 `confirmPreview`
- **THEN** 输入 SHALL 只包含主进程签发的 authorization ID 和 `rememberForWindow`
- **AND** SHALL NOT 接受新的文件路径、Workspace ID、Folder path 或 webContents ID

### Requirement: 可信根使用 canonical path 和已注册 worktree

系统 SHALL 将当前 Workspace 每个 available Folder 的 canonical root 与该 Folder repository 的 registered canonical worktrees 作为可信根；missing Folder SHALL NOT 进入候选。目标和可信根 SHALL 先经过 `realpath`，再以路径分段 containment 判断，且 SHALL 以 longest canonical root match 投影最具体的 `{ folderId, worktreePath }` owner；SHALL NOT 使用字符串前缀或任意首个匹配。

#### Scenario: 任一 available member 内普通文件直接预览

- **WHEN** 目标 canonical path 位于当前 Workspace 任一 available Folder 的 canonical root 内
- **THEN** `preparePreview` SHALL 在文件校验成功后返回 `ready`
- **AND** ready result SHALL 包含该成员的 `folderId` 与 main `worktreePath`
- **AND** SHALL NOT 要求用户二次确认

#### Scenario: Registered linked worktree 文件直接预览

- **WHEN** 目标 canonical path 位于任一成员 repository 的 registered linked worktree canonical root 内
- **THEN** `preparePreview` SHALL 在文件校验成功后返回 `ready`
- **AND** owner projection SHALL 返回该 Folder 与具体 linked `worktreePath`

#### Scenario: Folder root 与内嵌 worktree 同时命中

- **WHEN** linked worktree target 同时包含于 Folder root 与更具体的 registered worktree root
- **THEN** longest root match SHALL 选择具体 worktree
- **AND** SHALL NOT 依赖 Folder 或 worktree 枚举顺序

#### Scenario: 单成员 worktree 枚举失败时安全降级

- **WHEN** 主进程无法取得某一成员的 registered worktree 列表
- **THEN** 系统 SHALL 只丢弃该成员的 worktree candidates并记录 warning
- **AND** 该成员 canonical Folder root 与其他成员 roots SHALL 保持可信

#### Scenario: 单成员 Folder root 无法 canonicalize

- **WHEN** 某一 available Folder path 无法 canonicalize
- **THEN** 系统 SHALL 排除该成员的全部 trusted roots
- **AND** 其他成员 SHALL 继续参与本次判定

#### Scenario: Folder root 内 symlink 指向外部

- **WHEN** 链接的表面路径位于 Folder root 内但 canonical target 位于所有可信根之外
- **THEN** 系统 SHALL 将该文件视为 Workspace 外文件
- **AND** SHALL 在返回任何文件内容前要求二次确认

## ADDED Requirements

### Requirement: Chat preview 区分 Window trust 与 Agent Session scope

从 Chat/Session 发起的 ready preview SHALL 在存在 Session comparison context 时返回 `agentScope: "authorized" | "window-only"`。只有 member-derived target 的 `folderId` 与 snapshotted `folderPath` 均匹配 `SessionWorkspaceSnapshot`、Session 未 stale 且 worktree 仍有效时 SHALL 为 `authorized`；current-only member、user-confirmed external target 或不能证明属于 snapshot 的 target SHALL 为 `window-only`。非 Session 页面 MAY 省略 `agentScope`。

#### Scenario: 旧 Session 预览新加入成员

- **WHEN** Window 当前信任一个 Workspace 新成员文件但该 Folder 不在 active Session snapshot
- **THEN** preview SHALL 返回 ready 与 `agentScope: "window-only"`
- **AND** UI SHALL 允许查看并说明当前 Agent Session 无权访问

#### Scenario: Session snapshot 内成员文件

- **WHEN** target owner 与未 stale Session snapshot 的 `folderId/folderPath` 匹配
- **THEN** preview SHALL 返回 `agentScope: "authorized"`
- **AND** UI MAY 提供转换为结构化 member file resource 的动作

#### Scenario: Workspace 外 remembered grant

- **WHEN** Chat 通过当前 Window remembered grant 读取 Workspace 外 exact canonical path
- **THEN** preview SHALL 返回 `agentScope: "window-only"`
- **AND** SHALL NOT 伪造 `folderId` 或 `worktreePath`

#### Scenario: Window-only target 发送给 Agent

- **WHEN** renderer 尝试将 `window-only` target 持久化为 member file resource 或 dispatch 给旧 Session Agent
- **THEN** Main SHALL 拒绝请求
- **AND** 用户 MAY 通过新建 Session 或上传独立 attachment copy 提供内容
