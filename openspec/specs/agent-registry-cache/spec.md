# agent-registry-cache Specification

## Purpose

管理 ACP registry 数据与 agent 图标的本地缓存，减少网络请求，保证离线可用性。

## Requirements

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

### Requirement: Agent 图标本地缓存

主进程 SHALL 将 agent 图标下载后存储为文件 `getDataSubPath('agents')/icons/<agent-id>`，并在 `acp:getIcons` 调用时以 base64 data URL 形式批量返回。每次后台刷新 registry 后，对比各 agent 的 `icon` URL 是否变化，URL 变化时删除对应缓存文件，下次 `getIcons` 调用时重新下载。

#### Scenario: 图标缓存命中

- **WHEN** 前端调用 `acp:getIcons`，且所有 agent 图标文件均已存在
- **THEN** 主进程读取文件并返回 `Record<agentId, base64DataURL>`，不发起网络请求

#### Scenario: 部分图标缺失

- **WHEN** 前端调用 `acp:getIcons`，且部分 agent 图标文件不存在
- **THEN** 主进程对缺失图标发起下载，下载完成后写入文件；返回所有已成功获取的图标（下载失败的 id 不包含在结果中）

#### Scenario: Icon URL 变化触发图标重新下载

- **WHEN** 后台刷新 registry 时，某 agent 的 `icon` URL 与缓存中记录的不同
- **THEN** 主进程删除该 agent 对应的图标缓存文件，在下次 `getIcons` 调用时重新下载

### Requirement: Registry 数据出口注入 FylloCode 元数据

主进程 `src/main/infra/storage/acp-registry-cache.ts` 中暴露的 registry 数据出口 `getRegistry()` 与 `refreshRegistry()` SHALL 在返回前对 `data.agents` 每个条目注入 `__fyllo.kind`，值由 FylloCode 内置 `AgentKindMap` 解析得到。注入 SHALL 是**纯函数式**的不可变映射，不修改入参，不产生副作用，不写入磁盘缓存。

#### Scenario: getRegistry 出口注入分类

- **WHEN** 任意主进程模块调用 `getRegistry()`
- **THEN** 返回值 `AcpRegistry.agents` 中每个 entry SHALL 携带 `__fyllo: { kind }`，且 `kind` 与 `resolveAgentKind(entry.id)` 一致

#### Scenario: refreshRegistry 出口注入分类

- **WHEN** 主进程调用 `refreshRegistry()`
- **THEN** 返回值 `AcpRegistry.agents` 中每个 entry SHALL 携带 `__fyllo: { kind }`，且 `kind` 与 `resolveAgentKind(entry.id)` 一致

#### Scenario: 磁盘缓存保持上游原始数据

- **WHEN** 主进程刷新 registry 并通过 `writeRegistryCache` 写入 `registry-cache.json`
- **THEN** 文件中的 `data.agents` 条目 SHALL **不**包含 `__fyllo` 字段
- **AND** 旧版本写入的、不含 `__fyllo` 的缓存文件 SHALL 仍可被 `readRegistryCache` 正常读取

#### Scenario: 分类映射变更立即生效

- **WHEN** FylloCode 升级后 `AgentKindMap` 内容发生变化（例如新增 bridge 条目）
- **THEN** 下一次 `getRegistry()` 调用即可返回新的分类
- **AND** 不需要等待 24h TTL 过期或手动刷新缓存
