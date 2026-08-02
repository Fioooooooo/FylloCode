# local-file-link-preview Specification

## Purpose

定义 FylloCode 在所有 MarkStream 宿主中预览绝对本地文本文件的统一行为边界，包括窗口级单实例 Slideover、主进程路径校验与项目外二次授权，以及只读 Monaco 展示和资源清理契约。

## Requirements

### Requirement: 所有 MarkStream 宿主统一识别本地文件链接

系统 SHALL 在共享 `MarkStream` 的 scoped link override 中识别本地文件链接，使 Chat、Specs、Guidelines、Knowledge、Proposal 以及嵌套 MarkStream 自动获得相同预览能力，且 SHALL NOT 要求页面 wrapper、route 开关或 `App.vue` 常驻注册。

本地文件候选 SHALL 仅包括 percent decoding 成功后的 POSIX 绝对路径、Windows drive path 和 UNC path，并可携带末尾 `:line[:column]`。相对路径、`file://` 和其他 URI scheme SHALL NOT 作为本能力的候选。

#### Scenario: 不同文档宿主使用同一能力

- **WHEN** Chat、Specs、Guidelines、Knowledge、Proposal 或嵌套 MarkStream 渲染一个绝对本地文件链接
- **THEN** 点击该链接 SHALL 调用同一个本地文件预览入口
- **AND** 宿主 SHALL NOT 创建自己的 Slideover 或 Monaco 实例

#### Scenario: 普通链接保留 Markstream 行为

- **WHEN** 链接为相对路径、`file://`、`http://`、`https://`、其他 URI scheme 或无法安全 percent decode
- **THEN** 系统 SHALL 使用 `markstream-vue` 默认 `LinkNode` 行为
- **AND** SHALL NOT 发起本地文件预览 IPC

#### Scenario: 跨平台绝对路径成为候选

- **WHEN** 链接目标为 POSIX 绝对路径、Windows drive path 或 UNC path
- **THEN** 系统 SHALL 将 decoded path 交给全局本地文件预览入口
- **AND** SHALL 保留链接文字、title、焦点与键盘激活语义

### Requirement: 本地文件预览使用窗口级全局单实例 Slideover

系统 SHALL 在每个 Renderer Window 内最多保留一个活动预览，并 SHALL 仅在用户点击本地文件链接时通过 Nuxt UI overlay 创建 `LocalFilePreviewSlideover`。Overlay SHALL 使用 `destroyOnClose: true`，关闭时 SHALL 销毁 Slideover 与 Monaco 资源。

#### Scenario: 空闲 MarkStream 不创建重型资源

- **WHEN** 页面渲染任意数量的 MarkStream 但用户尚未点击本地文件链接
- **THEN** 系统 SHALL NOT 创建本地文件 Slideover
- **AND** SHALL NOT 为本能力创建 Monaco editor 或 model

#### Scenario: 点击后立即打开 loading 面板

- **WHEN** 用户点击本地文件候选链接
- **THEN** 系统 SHALL 立即打开全局 Slideover 并显示 loading 状态
- **AND** SHALL 在后台请求主进程准备预览

#### Scenario: 较旧请求不能覆盖较新预览

- **WHEN** 同一窗口先后发起两个预览请求且第一个请求较晚完成
- **THEN** 系统 SHALL 只展示最新请求的结果
- **AND** SHALL NOT 让过期响应替换当前预览

#### Scenario: 关闭预览释放资源

- **WHEN** 用户关闭本地文件预览 Slideover
- **THEN** 系统 SHALL 调用 Monaco cleanup
- **AND** Nuxt UI SHALL 销毁该 overlay 实例

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

### Requirement: 预览只读取受限的 UTF-8 普通文本文件

系统 SHALL 在每次读取前重新验证目标存在、为普通文件、size 不超过 5 MiB、内容不含 NUL byte且能以 fatal UTF-8 解码。系统 SHALL 接受 UTF-8 BOM 并在展示内容中移除 BOM。目录、特殊文件、二进制、无效 UTF-8、权限不足或超限文件 SHALL 返回明确错误，且 SHALL NOT 提供绕过限制的操作。

#### Scenario: 合法 UTF-8 文件返回内容

- **WHEN** 文件为不超过 5 MiB 的普通 UTF-8 或 UTF-8 BOM 文本
- **THEN** 系统 SHALL 返回 `ready` 与完整文本快照
- **AND** UTF-8 BOM SHALL NOT 显示在 Monaco 内容中

#### Scenario: 文件超过大小上限

- **WHEN** 文件 stat size 或实际读取长度超过 5 MiB
- **THEN** 系统 SHALL 返回文件过大错误
- **AND** SHALL NOT 返回部分内容或“仍然打开”操作

#### Scenario: 目标不是受支持文本文件

- **WHEN** 目标为目录、设备、FIFO、socket、包含 NUL byte 的文件或无效 UTF-8
- **THEN** 系统 SHALL 返回与原因对应的错误
- **AND** SHALL NOT 创建 Monaco editor

#### Scenario: Remembered grant 不绕过文件校验

- **WHEN** 已记住的 canonical path 后来变为超限、非普通文件或无效文本
- **THEN** 系统 SHALL 在下一次读取时拒绝预览
- **AND** SHALL NOT 因 remembered grant 跳过资格检查

### Requirement: Monaco 只读展示并支持源码定位

系统 SHALL 仅在预览结果为 `ready` 且用户选择原文模式后创建一个 `stream-monaco` editor，并将其配置为只读、显示行号、关闭 minimap、允许搜索、选择与复制。路径存在性解析 SHALL 先尝试完整文件名，只有完整路径不存在时才把末尾 `:line[:column]` 解释为定位信息。

#### Scenario: Ready 之前不创建 Monaco

- **WHEN** Slideover 处于 loading、confirmation-required 或 error
- **THEN** 系统 SHALL NOT 创建 Monaco editor
- **AND** SHALL 使用轻量 UI 展示当前状态

#### Scenario: 带行列定位的文件链接

- **WHEN** 完整 requested path 不存在但剥离有效 `:line[:column]` 后文件存在
- **THEN** 系统 SHALL 打开基础文件
- **AND** Monaco SHALL 将光标定位到指定 line/column 并在视口中 reveal

#### Scenario: 文件名本身以冒号数字结尾

- **WHEN** 完整 requested path 对应一个真实存在的文件且文件名以 `:12` 或 `:12:3` 结尾
- **THEN** 系统 SHALL 优先打开该完整文件名
- **AND** SHALL NOT 把末尾数字误判为 line/column

#### Scenario: 只读编辑器不修改文件

- **WHEN** 用户在 ready 状态的原文模式与 Monaco 交互
- **THEN** 编辑器 SHALL 阻止内容修改但允许搜索、选择和复制
- **AND** 系统 SHALL NOT 暴露保存或回写文件的动作

### Requirement: 原文预览支持内容溢出与自动换行

系统 SHALL 在本地文件预览处于 ready 状态的原文模式时提供“内容溢出”和“自动换行”两个互斥显示选项。Slideover 每次打开时 SHALL 默认选择“内容溢出”；该选项 SHALL 只影响当前 Slideover 中 Monaco 的 `wordWrap` 布局，SHALL NOT 修改文件内容、文件位置、授权状态或任何持久化用户设置。

#### Scenario: 默认以内容溢出查看长行

- **WHEN** 用户打开任意可预览文本文件且 Slideover 进入 ready 原文模式
- **THEN** 系统 SHALL 以关闭 Monaco 自动换行的“内容溢出”模式展示内容
- **AND** 单行过长时用户 SHALL 能通过原有编辑器横向滚动查看完整内容

#### Scenario: 用户切换为自动换行

- **WHEN** 用户在原文模式中选择“自动换行”
- **THEN** 系统 SHALL 在不重新读取文件的情况下启用 Monaco 自动换行
- **AND** 原有只读、搜索、选择、复制和行列定位能力 SHALL 保持可用

#### Scenario: 换行偏好不跨 Slideover 保留

- **WHEN** 用户关闭已切换为“自动换行”的 Slideover 后重新打开任意文件预览
- **THEN** 新 Slideover SHALL 再次默认选择“内容溢出”
- **AND** 系统 SHALL NOT 写入任何设置、IPC 请求或文件内容

### Requirement: 常见 Markdown 文件后缀被识别为 Markdown

系统 SHALL 将大小写不敏感的 `.md`、`.markdown`、`.mdown`、`.mkdn`、`.mkd`、`.mdwn`、`.mdtxt` 和 `.mdtext` 后缀映射为本地预览 document 的 `language: "markdown"`。其他后缀 SHALL 继续使用既有语言识别或 `plaintext` 回退行为。

#### Scenario: 常见 Markdown 后缀获得 Markdown 语言

- **WHEN** 用户预览一个扩展名为列举的任一 Markdown 后缀的合格 UTF-8 文本文件，且后缀使用任意大小写
- **THEN** `preparePreview` 或 `confirmPreview` 返回的 ready document SHALL 包含 `language: "markdown"`
- **AND** Slideover SHALL 将该文件视为可提供 MarkStream 预览的 Markdown 文件

#### Scenario: 未识别后缀保持原有回退

- **WHEN** 用户预览一个不在 Markdown 后缀集合内的合格文本文件
- **THEN** 系统 SHALL 使用既有的扩展名映射或 `plaintext` 作为 document language
- **AND** SHALL NOT 因此显示 Markdown 渲染预览切换

### Requirement: Markdown 本地文件可在原文与 MarkStream 预览之间切换

系统 SHALL 在 ready document 的 `language` 为 `markdown` 时，在本地文件预览 Slideover 中提供“原文”和“MarkStream 预览”两个互斥查看模式，并 SHALL 默认显示原文。MarkStream 预览 SHALL 使用共享 `MarkStream` 组件渲染读取到的文本快照，且 SHALL 以非流式方式使用当前 renderer 主题。非 Markdown ready document SHALL NOT 显示或启用 MarkStream 预览模式。

#### Scenario: Markdown 文件默认显示原文

- **WHEN** 用户打开被识别为 Markdown 的本地文件且预览进入 ready 状态
- **THEN** 系统 SHALL 默认显示只读 Monaco 原文
- **AND** SHALL 同时显示原文与 MarkStream 预览的查看模式控制

#### Scenario: 切换到 MarkStream 渲染预览

- **WHEN** 用户在 Markdown 原文模式中选择“MarkStream 预览”
- **THEN** 系统 SHALL 使用当前 ready document 的完整文本快照渲染共享 MarkStream
- **AND** SHALL 清理当前 Monaco editor，避免同时保留编辑器资源
- **AND** 渲染预览内的绝对本地文件链接 SHALL 继续通过既有本地文件预览入口打开

#### Scenario: 切回原文保留当前文档定位与换行选择

- **WHEN** 用户从 Markdown 的 MarkStream 预览切回“原文”
- **THEN** 系统 SHALL 为当前 ready document 重建只读 Monaco editor
- **AND** SHALL 按 document 的 line/column 恢复源码定位，并使用用户在当前 Slideover 中选择的内容溢出或自动换行模式

#### Scenario: 非 Markdown 文件不展示渲染切换

- **WHEN** 用户打开语言不是 `markdown` 的合格文本文件
- **THEN** 系统 SHALL 只提供原文预览与内容溢出/自动换行控制
- **AND** SHALL NOT 创建 MarkStream 渲染器
