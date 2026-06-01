## MODIFIED Requirements

### Requirement: Registry 数据本地缓存

主进程 SHALL 将从 ACP registry 获取的数据缓存到 `getDataSubPath('acp')/registry-cache.json`，结构为 `{ fetchedAt: string, data: AcpRegistry }`，其中 `fetchedAt` SHALL 为 ISO 8601 字符串（如 `"2026-06-01T05:38:28.407Z"`）。缓存 TTL 为 24 小时。

TTL 判断 SHALL 使用 `Date.now() - new Date(fetchedAt).getTime() > TTL_MS` 计算。

#### Scenario: 缓存命中（TTL 内）

- **WHEN** 前端调用 `acp:getRegistry`，且缓存存在且 `fetchedAt` 距今不超过 24 小时
- **THEN** 主进程直接返回缓存数据，不发起网络请求

#### Scenario: 缓存过期触发后台刷新

- **WHEN** 前端调用 `acp:getRegistry`，且缓存已过期（超过 24 小时）
- **THEN** 主进程先返回过期缓存数据（保证响应速度），同时在后台发起网络请求；网络请求成功后更新缓存并通过 `acp:registryUpdated` 推送新数据给前端

#### Scenario: 无缓存且网络可用

- **WHEN** 前端调用 `acp:getRegistry`，且本地无缓存
- **THEN** 主进程发起网络请求，成功后写入缓存并返回数据

#### Scenario: 无缓存且网络不可用

- **WHEN** 前端调用 `acp:getRegistry`，且本地无缓存，且网络请求失败
- **THEN** 主进程返回错误响应，前端展示"加载失败"状态

#### Scenario: 有缓存且网络不可用

- **WHEN** 前端调用 `acp:getRegistry`，且缓存存在（无论是否过期），且网络请求失败
- **THEN** 主进程返回缓存数据，不报错

#### Scenario: 强制刷新

- **WHEN** 前端调用 `acp:refreshRegistry`
- **THEN** 主进程忽略缓存 TTL，立即发起网络请求；成功后更新缓存并返回新数据；失败时返回错误

#### Scenario: fetchedAt 以 ISO 字符串写入

- **WHEN** 主进程写入或更新 `registry-cache.json`
- **THEN** `fetchedAt` 字段 SHALL 为 ISO 8601 字符串（`new Date().toISOString()` 的输出），而非 Unix 毫秒时间戳数字
