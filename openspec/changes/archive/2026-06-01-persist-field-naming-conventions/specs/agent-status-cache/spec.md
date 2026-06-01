## MODIFIED Requirements

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
