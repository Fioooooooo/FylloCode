# agent-status-cache 规范

## Purpose

定义 CLI agent 安装状态的批量检测、本地缓存、stale-while-revalidate 刷新与状态广播机制。

## Requirements

### Requirement: 批量化安装状态检测

主进程检测全部 Agent 安装状态时，SHALL 按检测方式（npx / uvx / binary）分组聚合，使每类外部命令在单次检测周期内只执行一次，进程数量不随 npx / uvx 类 Agent 数量线性增长。

- npx 类：SHALL 只执行一次 `npm list -g --depth=0 --json`（不带任何包名）获取全量全局包清单，再在内存中按各 npx Agent 的包名（经 `stripPackageVersion` 去版本后缀）匹配判断是否安装与版本。
- uvx 类：SHALL 在单次检测周期内只执行一次 `uv tool list`，再在内存中匹配各 uvx Agent。
- `which npm`、`which uv` 等命令路径查找 SHALL 在单次检测周期内各只执行一次并复用结果。
- binary 类：因需对每个二进制实际探测路径与版本，允许逐 Agent 执行 `which <cmd>` 与 `<cmd> --version`，但 SHALL 与上述聚合查询并行执行。

检测的对外输出 SHALL 保持为 `AcpAgentStatus[]`，逐项结构与字段语义不变；本要求只改变内部检测实现，不改变 `acp:detectStatus` 的 IPC 契约。

#### Scenario: npx 全量查询只执行一次

- **WHEN** registry 含多个 npx 分发的 Agent，主进程执行一次完整状态检测
- **THEN** `npm list -g` SHALL 只被调用一次（不带具体包名），各 npx Agent 的安装判断与版本 SHALL 通过对该次结果的内存匹配得出

#### Scenario: 命令路径查找复用

- **WHEN** 单次检测周期内存在多个 npx 类 Agent
- **THEN** `which npm`（Windows 为 `where npm`）SHALL 只执行一次，结果在该周期内复用

#### Scenario: 检测输出结构不变

- **WHEN** 批量化检测完成
- **THEN** 返回值 SHALL 为 `AcpAgentStatus[]`，每个元素的字段（`id`、`installed`、`detectedVersion`、`managedBy`、`installMethod`、`updateAvailable`、`latestVersion`）含义与批量化前一致

### Requirement: 安装状态本地缓存

主进程 SHALL 将一次完整检测的结果缓存到 `getDataSubPath('acp')/status-cache.json`，结构为 `{ fetchedAt: string, statuses: AcpAgentStatus[] }`，其中 `fetchedAt` SHALL 为 ISO 8601 字符串（如 `"2026-06-01T05:38:28.407Z"`）。该缓存为检测输出的只读派生快照，不替代 `installed.json`（安装账本权威源），且 SHALL NOT 设置时间 TTL。

#### Scenario: 写入状态缓存

- **WHEN** 主进程完成一次完整的安装状态检测
- **THEN** 主进程 SHALL 将结果以 `{ fetchedAt, statuses }` 写入 `status-cache.json`，`fetchedAt` 为写入时刻的 ISO 8601 字符串（`new Date().toISOString()`），`statuses` 为该次检测产出的完整 `AcpAgentStatus[]`（含 `installed: false` 的未安装 Agent）

#### Scenario: 读取损坏或缺失的缓存

- **WHEN** `status-cache.json` 不存在或内容无法解析为合法 JSON
- **THEN** 读取方 SHALL 返回空（无缓存），不抛出异常，由调用方回退到前台同步检测

#### Scenario: 缓存不作时间过期判断

- **WHEN** `status-cache.json` 存在且可解析，无论 `fetchedAt` 距今多久
- **THEN** 该缓存 SHALL 被视为可用快照返回，新鲜度由后台刷新与手动刷新保证，而非 TTL

### Requirement: 自动检测的 stale-while-revalidate 行为

`acp:detectStatus` SHALL 采用「先返回缓存、后台刷新」策略：缓存存在时立即返回缓存快照以保证面板秒开，同时在后台执行批量化检测，完成后写回缓存并通过 `acp:statusUpdated` 推送最新结果；缓存不存在时前台同步执行检测后返回。

#### Scenario: 有缓存时秒开并后台刷新

- **WHEN** 前端调用 `acp:detectStatus`，且 `status-cache.json` 存在
- **THEN** 主进程 SHALL 立即返回缓存中的 `statuses`
- **AND** 主进程 SHALL 在后台执行批量化检测，完成后更新缓存并通过 `acp:statusUpdated` 推送最新 `AcpAgentStatus[]`

#### Scenario: 无缓存时前台检测

- **WHEN** 前端调用 `acp:detectStatus`，且 `status-cache.json` 不存在（首次运行）
- **THEN** 主进程 SHALL 前台同步执行批量化检测，写入缓存后返回检测结果，本次不依赖 `acp:statusUpdated`

#### Scenario: 外部安装变更经后台刷新跟上

- **WHEN** 用户在 App 外部（如终端 `npm i -g`）改变了某 Agent 安装状态，随后打开 Agent 面板
- **THEN** 面板先展示上次缓存快照，后台检测完成后通过 `acp:statusUpdated` 将该 Agent 状态更新为真实状态

### Requirement: 状态更新广播通道

主进程 SHALL 提供广播通道 `acp:statusUpdated`，在后台检测完成且缓存更新后，向所有 `BrowserWindow` 推送最新 `AcpAgentStatus[]`，机制与既有 `acp:registryUpdated` 一致。

#### Scenario: 后台检测完成推送

- **WHEN** 后台批量化检测完成并写入 `status-cache.json`
- **THEN** 主进程 SHALL 通过 `acp:statusUpdated` 向所有窗口发送最新 `AcpAgentStatus[]`

#### Scenario: 前端接收并覆盖状态

- **WHEN** 前端 store 收到 `acp:statusUpdated` 推送
- **THEN** store SHALL 用推送的 `AcpAgentStatus[]` 覆盖本地 `statuses`，触发面板卡片就地刷新
