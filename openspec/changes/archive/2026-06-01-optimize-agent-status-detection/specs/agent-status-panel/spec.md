## MODIFIED Requirements

### Requirement: 手动刷新检测

页面顶部 SHALL 提供 "Refresh" 按钮，点击后触发 store action `refreshAll()`，重新拉取 registry、图标与安装状态。刷新期间按钮 SHALL 显示 loading 状态，完成后恢复。

手动刷新的安装状态检测 SHALL 绕过 `status-cache.json` 缓存，前台等待批量化检测的真实结果后再更新界面（不得直接返回缓存快照），以保证用户在系统中安装/卸载 Agent 后点击 Refresh 能立即看到正确状态。检测完成后 SHALL 一并更新 `status-cache.json` 缓存。

#### Scenario: 点击 Refresh 按钮

- **WHEN** 用户点击 "Refresh" 按钮
- **THEN** 按钮进入 loading 状态，`refreshAll()` action 被调用，安装状态经前台实时检测后更新，完成后 agent 卡片状态更新

#### Scenario: 新安装 agent 后刷新

- **WHEN** 用户在系统中安装了某 agent 后点击 Refresh
- **THEN** 检测 SHALL 绕过缓存执行实时探测，对应 agent 卡片状态从 "Not Installed" 变为 "Installed" 并显示版本号

#### Scenario: 卸载 agent 后刷新

- **WHEN** 用户在系统中卸载了某 agent 后点击 Refresh
- **THEN** 检测 SHALL 绕过缓存执行实时探测，对应 agent 卡片状态变为 "Not Installed"

## ADDED Requirements

### Requirement: App 打开时复用状态缓存并后台刷新

App 启动 bootstrap 流程检测 Agent 安装状态时，SHALL 优先复用 `status-cache.json` 缓存快照让面板秒开，同时在后台执行检测并在完成后通过 `acp:statusUpdated` 就地更新卡片，不阻塞首屏展示。该路径复用 `useAcpAgentsStore` 的 `refreshStatus()`（stale-while-revalidate 模式），与手动刷新的强制实时检测路径区分。

#### Scenario: bootstrap 阶段秒开

- **WHEN** App 启动，bootstrap 的 acp-agents 任务调用 `ensureInitialized()` 触发 `refreshStatus()`，且存在状态缓存
- **THEN** 面板 SHALL 立即以缓存快照渲染 agent 卡片，无需等待实时检测完成

#### Scenario: bootstrap 后台刷新就地更新

- **WHEN** bootstrap 阶段返回缓存后，后台检测完成并推送 `acp:statusUpdated`
- **THEN** store 的 `statuses` SHALL 被最新结果覆盖，相关 agent 卡片状态就地更新，无需用户手动操作

#### Scenario: 首次运行无缓存

- **WHEN** App 首次运行，`status-cache.json` 不存在
- **THEN** bootstrap 阶段 SHALL 前台等待批量化检测完成后再渲染卡片状态
