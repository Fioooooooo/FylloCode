## Why

持久化文件中存在两类命名不一致问题：部分时间字段使用 Unix 时间戳数字而非 ISO 字符串，`session-meta-storage` spec 也明确规定 `config_options` 落盘 key 为 snake_case，与 FylloCode 其他持久化字段的驼峰风格不一致。统一规范有助于降低读写层的转换负担，并使持久化文件对人类可读。

## What Changes

- **BREAKING** `session-meta-storage`：`SessionMeta` 落盘字段 `config_options` 重命名为 `configOptions`，同步修改所有读写该字段的代码及测试
- **BREAKING** `agent-registry-cache`：`registry-cache.json` 中 `fetchedAt` 类型从 `number`（Unix 毫秒时间戳）改为 ISO 8601 字符串
- **BREAKING** `agent-status-cache`：`status-cache.json` 中 `fetchedAt` 类型从 `number`（Unix 毫秒时间戳）改为 ISO 8601 字符串
- **BREAKING** `agent-install`：`installed.json` 中 `installedAt` 类型从 `number`（Unix 毫秒时间戳）改为 ISO 8601 字符串
- 新增 `persist-field-naming-conventions` guideline，固定以下规范：
  - FylloCode 主动声明的持久化字段 key 统一使用驼峰命名
  - FylloCode 主动声明的时间字段统一使用 ISO 8601 字符串
  - 直接透传并保存 ACP agent 返回值的字段（如 `config_options` 内部的 option 对象）不受此约束，按原样存储

## Capabilities

### New Capabilities

- `persist-field-naming-conventions`：定义 FylloCode 持久化层字段命名与时间格式规范

### Modified Capabilities

- `session-meta-storage`：`config_options` 落盘 key 改为驼峰 `configOptions`
- `agent-registry-cache`：`fetchedAt` 类型改为 ISO 8601 字符串
- `agent-status-cache`：`fetchedAt` 类型改为 ISO 8601 字符串

## Impact

- `electron/main/infra/storage/session-store.ts`：`SessionMeta` 类型字段重命名，读写逻辑同步更新
- `electron/main/services/chat/chat-service.ts`：`toSession` 映射更新
- `electron/main/services/chat/config-option-service.ts`：写入字段名更新
- `electron/main/ipc/chat.ts`：`patchSessionMeta` 调用处字段名更新
- `electron/main/infra/storage/acp-registry-cache.ts`：`fetchedAt` 写入改为 ISO 字符串
- `electron/main/infra/storage/acp-status-cache.ts`（或同等文件）：`fetchedAt` 写入改为 ISO 字符串
- `electron/main/infra/storage/acp-installed.ts`（或同等文件）：`installedAt` 写入改为 ISO 字符串
- 相关测试文件：`config-option-service.spec.ts`、`acp-session.spec.ts` 等
- `guidelines/` 目录：新增 `PersistFieldNamingConventions.md`
- 已存在的 `data/` 目录下的 JSON 文件为开发环境数据，迁移不在本次范围内（重启后自动重建）
