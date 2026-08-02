## MODIFIED Requirements

### Requirement: 主进程拥有预览路径和项目上下文

系统 SHALL 通过 `workspace.document` domain-first IPC 提供 `preparePreview` 与 `confirmPreview`。主进程 SHALL 从 IPC sender 对应的 `WorkspaceWindowManager` context 取得 `workspaceId`，SHALL NOT 接受 renderer 提供的 Workspace scope 或 webContents identity。

#### Scenario: Workspace window 发起预览

- **WHEN** workspace window 调用 `preparePreview`
- **THEN** handler SHALL 使用 `event.sender` 解析绑定的 Workspace 上下文
- **AND** 本阶段 SHALL 通过 Workspace resolver 取得 Folder Workspace 的唯一 Folder path
- **AND** SHALL 在该上下文内判断可信根与授权

#### Scenario: 无 Workspace 上下文不能读取文件

- **WHEN** launcher window、未知 sender 或已销毁 sender 调用预览 IPC
- **THEN** 系统 SHALL 返回受控错误
- **AND** SHALL NOT stat 或读取请求路径的文件内容

#### Scenario: Renderer 不能用确认接口替换路径

- **WHEN** renderer 调用 `confirmPreview`
- **THEN** 输入 SHALL 只包含主进程签发的 authorization ID 和 `rememberForWindow`
- **AND** SHALL NOT 接受新的文件路径、Workspace ID 或 webContents ID

### Requirement: 可信根使用 canonical path 和已注册 worktree

系统 SHALL 将当前 Folder Workspace 的唯一 Folder root 及该 repository 的 `git worktree list --porcelain` 返回的 registered worktree 作为可信根。目标和可信根 SHALL 先经过 `realpath`，再以路径分段 containment 判断是否可信；SHALL NOT 使用字符串前缀判断。本 proposal SHALL NOT 把尚未开放的其他 Workspace 成员加入实时 trust。

#### Scenario: Folder repository 内普通文件直接预览

- **WHEN** 目标 canonical path 位于当前 Folder Workspace 的 canonical Folder root 内
- **THEN** `preparePreview` SHALL 在文件校验成功后返回 `ready`
- **AND** SHALL NOT 要求用户二次确认

#### Scenario: Registered linked worktree 文件直接预览

- **WHEN** 目标 canonical path 位于当前 Folder repository 的 registered linked worktree canonical root 内
- **THEN** `preparePreview` SHALL 在文件校验成功后返回 `ready`
- **AND** SHALL NOT 因文件不在 main Folder path 下而要求确认

#### Scenario: Folder root 内 symlink 指向外部

- **WHEN** 链接的表面路径位于 Folder root 内但其 canonical target 位于所有可信根之外
- **THEN** 系统 SHALL 将该文件视为 Workspace 外文件
- **AND** SHALL 在返回任何文件内容前要求二次确认

#### Scenario: Worktree 枚举失败时安全降级

- **WHEN** 主进程无法取得 registered worktree 列表
- **THEN** 系统 SHALL 只把当前 Folder Workspace 的 canonical Folder root 视为可信
- **AND** SHALL NOT 因探测失败扩大可信目录范围

### Requirement: 项目外文件在读取前提供两个授权动作

当目标 canonical path 不位于可信根且当前窗口尚未记住该路径时，`preparePreview` SHALL 返回 `confirmation-required`，其中包含完整 canonical path、文件 size、mtime、line/column 和短期 authorization ID，但 SHALL NOT 包含文件 content。Slideover SHALL 提供“取消”“仅打开一次”“打开并在此窗口中信任”三个动作。

#### Scenario: Workspace 外文件确认状态不泄露内容

- **WHEN** 未授权的 Workspace 外文件通过基础类型和大小检查
- **THEN** Slideover SHALL 显示完整 canonical path 和文件元数据
- **AND** 主进程 SHALL NOT 在用户确认前读取或返回文件内容

#### Scenario: 仅打开一次

- **WHEN** 用户选择“仅打开一次”
- **THEN** 系统 SHALL 使用 authorization ID 读取并显示该文件一次
- **AND** SHALL NOT 将 canonical path 加入当前窗口的 remembered grants
- **AND** 后续重新读取同一路径 SHALL 再次要求确认

#### Scenario: 当前窗口信任

- **WHEN** 用户选择“打开并在此窗口中信任”
- **THEN** 系统 SHALL 在读取成功后将 `{ workspaceId, canonicalPath }` 加入该 `webContents.id` 的内存 grant
- **AND** 当前窗口在相同 Workspace 上下文中再次读取该 canonical path SHALL 直接进入 `ready`

#### Scenario: 取消外部预览

- **WHEN** 用户在确认状态选择“取消”
- **THEN** Slideover SHALL 关闭而不调用 `confirmPreview`
- **AND** 系统 SHALL NOT 记录 grant 或返回文件内容

### Requirement: 外部文件授权绑定 sender、项目、路径和文件版本

每个 pending authorization SHALL 使用不可预测 ID，绑定 `webContents.id`、`workspaceId`、canonical path、size、mtime、line/column，并在 60 秒后过期。`confirmPreview` SHALL 重新验证 sender、Workspace、有效期和文件 metadata，并 SHALL 在一次确认尝试后使 token 失效。

#### Scenario: 其他窗口不能复用 authorization

- **WHEN** 窗口 B 提交由窗口 A 获得的 authorization ID
- **THEN** 系统 SHALL 拒绝确认
- **AND** SHALL NOT 读取文件或为任一窗口记录 grant

#### Scenario: 授权过期

- **WHEN** 用户提交签发已超过 60 秒的 authorization ID
- **THEN** 系统 SHALL 返回授权失效错误
- **AND** 用户 SHALL 通过重新点击文件链接获取新的确认

#### Scenario: 确认前文件发生变化

- **WHEN** authorization 签发后 canonical path、size 或 mtime 发生变化
- **THEN** 系统 SHALL 作废该 authorization
- **AND** SHALL NOT 使用旧授权读取变化后的文件

#### Scenario: 读取失败不记录信任

- **WHEN** 用户选择窗口信任但文件在实际读取时失败
- **THEN** 系统 SHALL 返回明确错误
- **AND** SHALL NOT 记录 remembered grant

### Requirement: Remembered grant 仅存在于当前 Renderer Window 生命周期

系统 SHALL 将 remembered grants 保存在主进程内存中并按 `webContents.id` 隔离，grant key SHALL 同时包含 `workspaceId` 与 canonical path。Sender 销毁时 SHALL 清除其 grants 和 pending authorizations；grant SHALL NOT 持久化。

#### Scenario: 同一窗口导航后继续信任

- **WHEN** 用户已在 workspace window 中信任某个 canonical path，随后在同一 BrowserWindow 内导航或重新加载页面
- **THEN** 主进程中的 grant SHALL 继续有效
- **AND** 相同 Workspace context 再次读取该 path SHALL 不再确认

#### Scenario: 窗口关闭后信任消失

- **WHEN** workspace window 的 webContents 被销毁
- **THEN** 系统 SHALL 清除该 sender 的 remembered grants 和 pending authorizations
- **AND** 新窗口或应用重启后读取同一路径 SHALL 再次确认

#### Scenario: Workspace 上下文变化不复用信任

- **WHEN** 同一 webContents 从一个 Workspace context 切换或绑定到另一个 Workspace
- **THEN** 旧 `workspaceId` 下记录的 grant SHALL NOT 在新 Workspace 上下文命中
- **AND** 外部路径 SHALL 按新 Workspace 重新判断可信与授权

#### Scenario: Symlink 指向变化不复用信任

- **WHEN** 已信任的 symlink 之后解析到不同 canonical target
- **THEN** 新 canonical path SHALL NOT 命中旧 grant
- **AND** 若新目标在可信根外，系统 SHALL 再次要求确认
