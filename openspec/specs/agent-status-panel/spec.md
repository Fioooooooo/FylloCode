# agent-status-panel Specification

## Purpose

TBD - created by archiving change settings-page. Update Purpose after archive.

## Requirements

### Requirement: Agent 卡片列表展示

Agents tab SHALL 以网格卡片列表展示 ACP registry 中的所有 CLI agent。每张卡片 SHALL 包含：左侧 agent 图标与名称、名称下方版本号与 license、名称右侧（或同一信息行内）按 `__fyllo.kind` 渲染的分类徽章；右侧根据安装状态展示对应操作区域。卡片不可展开，无配置项，无 Add Agent 操作。

数据来源 SHALL 为 `useAcpAgentsStore` 中的 `registry`（通过 `acp:getRegistry` 获取），图标来源为 `icons`（通过 `acp:getIcons` 获取）。不得直接在组件中调用 `netApi`。Settings 页面 SHALL 只负责展示与手动刷新 ACP agent 数据，不得承担该数据的首次全局初始化职责。

分类徽章 SHALL 使用统一的共用组件（如 `AgentKindBadge.vue`），渲染规则：

- `native` 或缺失 `__fyllo`：不渲染分类徽章
- `adapter`：渲染 `i-lucide-layers` 图标，hover 显示「适配器 · 自带完整实现，可与已安装的对应 Agent 共享配置」
- `bridge`：渲染 `i-lucide-cable` 图标，hover 显示「桥接器 · 与 Agent 桥接打通，需要先安装对应的 Agent」

#### Scenario: 已安装且为最新版

- **WHEN** store 中某 agent 的 `installed` 为 `true` 且 `updateAvailable` 为 `false`
- **THEN** 卡片右侧显示绿色（`color="success"`）"Installed" 标签及检测到的版本号

#### Scenario: 已安装且有更新可用（FylloCode 管理）

- **WHEN** store 中某 agent 的 `installed` 为 `true`，`updateAvailable` 为 `true`，`managedBy` 为 `"fyllocode"`
- **THEN** 卡片右侧显示"Update Available"badge 及"更新"按钮，点击直接执行更新

#### Scenario: 已安装且有更新可用（用户自管理）

- **WHEN** store 中某 agent 的 `installed` 为 `true`，`updateAvailable` 为 `true`，`managedBy` 为 `"user"`
- **THEN** 卡片右侧显示"Update Available"badge 及"更新"按钮，点击弹出确认对话框

#### Scenario: 未安装 agent 展示

- **WHEN** store 中某 agent 的 `installed` 为 `false`
- **THEN** 卡片右侧显示"安装"按钮，点击触发安装流程

#### Scenario: 安装中状态

- **WHEN** 某 agent 正在安装（收到 `acp:installProgress` 推送，`status` 为 `"installing"` 或 `"downloading"`）
- **THEN** 卡片右侧"安装"/"更新"按钮替换为 loading 状态，其他 agent 的安装按钮禁用

#### Scenario: 打开 settings 时直接复用已预热数据

- **WHEN** 用户在 app bootstrap 完成后进入 settings agents 页面
- **THEN** 页面直接展示 `acp-agents` store 中已有的 registry/icons/statuses 数据
- **AND** 不需要重新执行首次初始化流程

#### Scenario: bootstrap 缺失时 settings 页面兜底初始化

- **WHEN** 用户进入 settings agents 页面时，全局 bootstrap 尚未完成或未触发，且 `acp-agents` store 仍未初始化
- **THEN** 页面可调用 `ensureInitialized()` 作为兜底
- **AND** 该兜底不改变"全局 bootstrap 为主路径"的职责边界

#### Scenario: native 卡片不显示分类徽章

- **WHEN** 渲染的 agent 满足 `__fyllo?.kind === "native"` 或 `__fyllo` 缺失
- **THEN** 卡片上 SHALL 不显示分类图标

#### Scenario: adapter 卡片显示 layers 图标与 tooltip

- **WHEN** 渲染的 agent 满足 `__fyllo?.kind === "adapter"`
- **THEN** 卡片名称区域 SHALL 显示 `i-lucide-layers` 图标
- **AND** hover 该图标时 SHALL 显示「适配器 · 自带完整实现，可与已安装的对应 Agent 共享配置」

#### Scenario: bridge 卡片显示 cable 图标与 tooltip

- **WHEN** 渲染的 agent 满足 `__fyllo?.kind === "bridge"`
- **THEN** 卡片名称区域 SHALL 显示 `i-lucide-cable` 图标
- **AND** hover 该图标时 SHALL 显示「桥接器 · 与 Agent 桥接打通，需要先安装对应的 Agent」

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
