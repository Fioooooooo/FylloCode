# project-window Specification

## Purpose

TBD - created by archiving change add-project-windows. Update Purpose after archive.

## Requirements

### Requirement: Application provides a launcher window

系统 SHALL 在没有绑定项目的窗口中展示 launcher，用于打开文件夹和最近项目。

#### Scenario: App starts with launcher

- **WHEN** 用户启动 FylloCode
- **THEN** 系统 SHALL 创建一个未绑定项目的 launcher window
- **AND** launcher window SHALL 展示现有欢迎页和最近项目入口
- **AND** launcher window SHALL NOT 设置 renderer 当前项目

#### Scenario: macOS activate recreates launcher when no windows exist

- **WHEN** 应用运行在 macOS 且所有窗口都已关闭
- **AND** 用户通过 Dock 或系统 activate 重新激活应用
- **THEN** 系统 SHALL 创建一个 launcher window

#### Scenario: Non-macOS closes app after all windows close

- **WHEN** 应用运行在非 macOS 平台
- **AND** 用户关闭所有 launcher 和 project window
- **THEN** 系统 SHALL 退出应用

### Requirement: Project opens in a dedicated window

系统 SHALL 将每个打开的项目绑定到独立 project window，并保证同一项目同一时间最多只有一个 project window。

#### Scenario: Launcher opens an unopened project

- **WHEN** 用户在 launcher window 中打开一个未打开且路径存在的项目
- **THEN** 系统 SHALL 创建或复用一个 window 并将其绑定为该项目的 project window
- **AND** 该 project window SHALL 将绑定项目暴露为 renderer 当前项目
- **AND** 系统 SHALL 导航到项目默认页面

#### Scenario: Launcher opens an already open project

- **WHEN** 用户在 launcher window 中打开一个已经有 project window 的项目
- **THEN** 系统 SHALL 聚焦该项目已有的 project window
- **AND** 系统 SHALL NOT 创建第二个绑定同一项目的 project window
- **AND** launcher window SHALL 保持未绑定项目状态

#### Scenario: Project window opens another project

- **WHEN** 用户在 project window 中打开另一个未打开且路径存在的项目
- **THEN** 系统 SHALL 创建新的 project window 并绑定目标项目
- **AND** 原 project window SHALL 继续绑定原项目
- **AND** 原 project window SHALL NOT 清空或替换其当前项目、会话列表或当前路由

#### Scenario: Reopening a project updates recency

- **WHEN** 用户打开或聚焦一个已登记项目
- **THEN** 系统 SHALL 更新该项目的 `lastOpenedAt`
- **AND** 最近项目列表 SHALL 能按更新后的打开时间排序

### Requirement: Project window context is owned by the main process

系统 SHALL 由主进程维护每个窗口的项目绑定，renderer SHALL 通过受控 IPC 获取窗口上下文。

#### Scenario: Renderer reads launcher context

- **WHEN** launcher window 的 renderer 启动并请求窗口上下文
- **THEN** 系统 SHALL 返回 role 为 `launcher` 且 `projectId` 为 `null` 的窗口上下文
- **AND** renderer SHALL 保持 `currentProject` 为空

#### Scenario: Renderer reads project context

- **WHEN** project window 的 renderer 启动并请求窗口上下文
- **THEN** 系统 SHALL 返回 role 为 `project` 且包含绑定 `projectId` 的窗口上下文
- **AND** renderer SHALL 加载该 `projectId` 对应项目并设置为当前窗口项目
- **AND** renderer SHALL 加载该项目的会话列表

#### Scenario: Project context bootstrap is ordered with project loading

- **WHEN** renderer 启动 bootstrap tasks
- **THEN** 系统 SHALL 在同一 projects bootstrap 流程中完成项目列表加载、窗口上下文读取和当前项目绑定
- **AND** 系统 SHALL NOT 依赖独立 bootstrap task 的执行顺序来保证窗口上下文先于项目加载完成

### Requirement: Project-scoped events are isolated by project window

系统 SHALL 只向对应项目窗口发送项目作用域事件，并防止不同项目中的同名运行时标识互相覆盖。

#### Scenario: Chat probe update is project scoped

- **WHEN** 项目 A 和项目 B 同时使用同一个 agent 创建 draft probe
- **THEN** 项目 A 的 probe registry entry SHALL NOT 覆盖项目 B 的 probe registry entry
- **AND** 项目 A 的 `chat:probe:update` SHALL 只发送给项目 A 的 project window
- **AND** 项目 B 的 project window SHALL NOT 应用项目 A 的 probe update

#### Scenario: Proposal status watcher is project scoped

- **WHEN** 项目 A 和项目 B 都存在相同 `changeId` 的 proposal
- **THEN** 系统 SHALL 分别维护项目 A 和项目 B 的 proposal status watcher
- **AND** 项目 A 的 proposal status update SHALL 只发送给项目 A 的 project window
- **AND** 项目 B 的 watcher SHALL NOT 被项目 A 的 watcher 替换或取消

#### Scenario: Same-project proposal watcher has multiple session subscribers

- **WHEN** 同一项目中的多个 session 同时 watch 相同 `changeId`
- **THEN** 系统 SHALL 复用同一个底层 proposal status watcher
- **AND** 状态变化 SHALL 分别发送给每个订阅该 `changeId` 的 session
- **AND** 取消其中一个 session 的订阅 SHALL NOT 关闭仍有其他 session 订阅的 watcher

#### Scenario: Global agent events reach every active window

- **WHEN** ACP agent registry、status、install progress、uninstall progress 或 unavailable 状态发生变化
- **THEN** 系统 SHALL 将该全局事件发送给所有未销毁窗口
- **AND** 每个窗口 SHALL 能更新其 agent UI 状态

### Requirement: Streaming runtime cancellation is project scoped

系统 SHALL 在取消 chat、apply 或 archive 流式运行时使用项目维度，避免不同项目的相同 runtime key 互相取消。

#### Scenario: Chat stream cancel only cancels matching project session

- **WHEN** 项目 A 和项目 B 存在相同 `sessionId` 的 chat stream
- **AND** 用户在项目 A 中取消该 `sessionId`
- **THEN** 系统 SHALL 只取消项目 A 的 chat stream
- **AND** 项目 B 的 chat stream SHALL 继续运行

#### Scenario: Apply stream cancel only cancels matching project run

- **WHEN** 项目 A 和项目 B 存在相同 `runId` 的 apply stage stream
- **AND** 用户在项目 A 中取消该 `runId`
- **THEN** 系统 SHALL 只取消项目 A 的 apply stream
- **AND** 项目 B 的 apply stream SHALL 继续运行

#### Scenario: Archive stream remains project scoped

- **WHEN** 用户取消 archive stream
- **THEN** 系统 SHALL 使用 `projectId` 和 `changeId` 定位 archive stream
- **AND** 系统 SHALL NOT 取消其他项目中相同 `changeId` 的 archive stream

### Requirement: Window state is persisted per launcher and project

系统 SHALL 为 launcher 和每个 project window 独立保存窗口 bounds 与最大化状态。

#### Scenario: Project window restores its own bounds

- **WHEN** 用户调整项目 A 的 project window bounds 并关闭该窗口
- **AND** 用户之后重新打开项目 A
- **THEN** 系统 SHALL 使用项目 A 最近保存的窗口状态创建 project window
- **AND** 系统 SHALL 按当前屏幕 work area clamp 该窗口状态

#### Scenario: Project windows do not share bounds

- **WHEN** 用户分别调整项目 A 和项目 B 的窗口 bounds
- **THEN** 系统 SHALL 分别保存项目 A 和项目 B 的窗口状态
- **AND** 重新打开项目 A 时 SHALL NOT 使用项目 B 的窗口状态

#### Scenario: Launcher has independent bounds

- **WHEN** 用户调整 launcher window bounds 并关闭 launcher
- **THEN** 系统 SHALL 保存 launcher 独立窗口状态
- **AND** launcher window SHALL NOT 读写任一项目的窗口状态

#### Scenario: Legacy main window state remains readable

- **WHEN** 新的 launcher 窗口状态不存在
- **AND** 旧的 `data/window-state/main-window.json` 存在且有效
- **THEN** 系统 MAY 使用旧 main window state 作为 launcher 初始状态
- **AND** 系统 SHALL NOT 删除旧 main window state 文件

### Requirement: Opening folders is window-owned

系统 SHALL 将打开文件夹对话框归属到发起窗口，并由主进程决定打开或聚焦项目窗口。

#### Scenario: Open folder dialog has parent window

- **WHEN** 用户在任意窗口触发打开文件夹
- **THEN** 系统 SHALL 使用发起 IPC 的 `webContents` 定位父 `BrowserWindow`
- **AND** 系统 SHALL 以该父窗口打开系统目录选择对话框

#### Scenario: Selected folder opens project window

- **WHEN** 用户选择一个有效文件夹
- **THEN** 系统 SHALL adopt 该文件夹为项目
- **AND** 系统 SHALL 按 project window 唯一性规则创建、绑定或聚焦项目窗口

#### Scenario: Missing project path does not create window

- **WHEN** 用户打开一个已登记但路径不存在的项目
- **THEN** 系统 SHALL 显示项目路径缺失错误
- **AND** 系统 SHALL NOT 创建新的 project window

### Requirement: Project deletion closes its project window

系统 SHALL 在删除项目时处理该项目已打开的 project window，避免窗口继续引用已删除项目。

#### Scenario: Remove open project

- **WHEN** 用户删除一个已打开 project window 的项目
- **THEN** 系统 SHALL 关闭该项目的 project window 或阻止删除并提示用户先关闭窗口
- **AND** 系统 SHALL 清理该项目的窗口注册表记录和项目级 runtime watcher
- **AND** 系统 SHALL NOT 让窗口继续展示已删除项目作为当前项目

#### Scenario: Remove last open project keeps launcher

- **WHEN** 用户删除最后一个已打开 project window 的项目
- **THEN** 系统 SHALL 保持应用运行并展示 launcher window
- **AND** 非 macOS 平台 SHALL NOT 因该删除动作触发应用退出
