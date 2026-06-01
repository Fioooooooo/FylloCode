## 1. 修改 SessionMeta 类型及读写代码

- [x] 1.1 修改 `electron/main/infra/storage/session-store.ts`：将 `SessionMeta` 类型中的 `config_options?: AcpSessionConfigOption[]` 重命名为 `configOptions?: AcpSessionConfigOption[]`；同步更新 `normalizeSessionMeta` 函数中读取 `raw.config_options` 的代码改为读取 `raw.configOptions`
- [x] 1.2 修改 `electron/main/services/chat/chat-service.ts`：将 `toSession` 函数中 `configOptions: meta.config_options` 改为 `configOptions: meta.configOptions`
- [x] 1.3 修改 `electron/main/services/chat/config-option-service.ts`：将第 44 行 `meta.config_options?.find(...)` 改为 `meta.configOptions?.find(...)`；将第 96 行 `patchSessionMeta` 调用中的 `config_options: normalized` 改为 `configOptions: normalized`；将第 100 行日志字符串中的 `config_options` 改为 `configOptions`
- [x] 1.4 修改 `electron/main/ipc/chat.ts`：将第 243 行 `config_options: probeEntry.configOptions` 改为 `configOptions: probeEntry.configOptions`；将第 337 行 `config_options: ev.options` 改为 `configOptions: ev.options`

## 2. 修改时间字段写入逻辑

- [x] 2.1 修改 `electron/main/infra/storage/acp-registry-cache.ts`：将 `AcpRegistryCache` 类型中 `fetchedAt: number` 改为 `fetchedAt: string`；将第 55 行 `fetchedAt: Date.now()` 改为 `fetchedAt: new Date().toISOString()`；将第 45 行 TTL 判断 `Date.now() - cache.fetchedAt > REGISTRY_TTL_MS` 改为 `Date.now() - new Date(cache.fetchedAt).getTime() > REGISTRY_TTL_MS`
- [x] 2.2 修改 `electron/main/infra/storage/acp-status-cache.ts`：将 `AcpStatusCache` 类型中 `fetchedAt: number` 改为 `fetchedAt: string`；将第 31 行 `fetchedAt: Date.now()` 改为 `fetchedAt: new Date().toISOString()`
- [x] 2.3 修改 `electron/main/services/acp-agent/installer.ts`：将第 96 行和第 104 行的 `installedAt: Date.now()` 改为 `installedAt: new Date().toISOString()`；同步修改 `InstalledAgentRecord` 类型（如在 `installer.ts` 或相关类型文件中）中 `installedAt: number` 改为 `installedAt: string`
- [x] 2.4 修改 `electron/main/domain/acp/detector.ts`：将第 435 行 `installedAt: existingRecord?.installedAt ?? Date.now()` 改为 `installedAt: existingRecord?.installedAt ?? new Date().toISOString()`

## 3. 更新测试文件

- [x] 3.1 修改 `electron/main/__tests__/services/chat/config-option-service.spec.ts`：将所有 `makeMeta({ config_options: ... })` 调用中的 `config_options` 改为 `configOptions`；将第 107 行 `expect.objectContaining({ config_options: result.configOptions, ... })` 改为 `expect.objectContaining({ configOptions: result.configOptions, ... })`
- [x] 3.2 修改 `electron/main/__tests__/infra/storage/acp-registry-cache.test.ts`：将 `writeCache` 函数签名中 `fetchedAt = Date.now()` 改为 `fetchedAt = new Date().toISOString()`；更新所有传入数字时间戳的调用处（如 TTL 相关测试中的 `Date.now() - TTL_MS - 1` 改为 `new Date(Date.now() - TTL_MS - 1).toISOString()`）
- [x] 3.3 修改 `electron/main/__tests__/infra/storage/acp-status-cache.test.ts`：将第 69 行 `{ fetchedAt: 1, statuses: {} }` 改为 `{ fetchedAt: "invalid", statuses: {} }`（保持测试意图：非法格式）；将第 80 行断言 `expect(written.fetchedAt).toBe(new Date("2026-05-30T08:00:00.000Z").getTime())` 改为 `expect(written.fetchedAt).toBe("2026-05-30T08:00:00.000Z")`
- [x] 3.4 修改 `electron/main/__tests__/services/acp-agent/acp-agent-service.spec.ts`：将第 79 行 `installedAt: Date.now()` 改为 `installedAt: new Date().toISOString()`；将第 139 行 `{ fetchedAt: 1, statuses: cachedStatuses }` 改为 `{ fetchedAt: new Date().toISOString(), statuses: cachedStatuses }`

## 5. 迁移脚本

- [x] 5.1 新建 `electron/main/migrations/20260601_001_config-options-camel-case.ts`：遍历 `data/projects/` 下所有 `sessions/*.json` 文件，将 `config_options` 字段重命名为 `configOptions`；若字段不存在或已是 `configOptions` 则静默跳过；通过 `MigrationContext.dataPath` 访问数据目录；将此迁移追加到 `electron/main/migrations/index.ts` 的 `migrations` 数组

- [x] 5.2 新建 `electron/main/migrations/20260601_002_installed-at-iso.ts`：读取 `acp/installed.json`，将每条记录的 `installedAt` 从 Unix 毫秒数字转换为 ISO 8601 字符串；若文件不存在或字段已是字符串则静默跳过；通过 `MigrationContext.dataPath` 访问数据目录；将此迁移追加到 `electron/main/migrations/index.ts` 的 `migrations` 数组

## 4. 更新 guideline 文档

- [x] 4.1 在 `guidelines/CodeStyle.md` 的 Rules 章节末尾新增一条 MUST 规则：FylloCode 主动声明的持久化字段 key（在 TypeScript 类型中显式定义、由 FylloCode 代码写入 JSON 文件的字段）SHALL 使用驼峰命名（camelCase）；ACP agent 返回值的内部结构（如 `available_commands` 数组内部字段）不受此约束，按原样存储
- [x] 4.2 在 `guidelines/DataModel.md` 的 Rules 章节中，将现有 SHOULD 规则升级为 MUST
