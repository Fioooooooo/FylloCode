## Context

FylloCode 持久化层目前存在两类不一致：

1. **时间字段格式**：`acp/registry-cache.json`（`fetchedAt`）、`acp/installed.json`（`installedAt`）、`acp/status-cache.json`（`fetchedAt`）使用 Unix 毫秒时间戳（`number`），而 `sessions/*.json`、`projects/*/meta.json`、`integrations/connections.json` 使用 ISO 8601 字符串。
2. **字段命名**：`session-meta-storage` spec 明确规定 `config_options` 落盘 key 为 snake_case，与 FylloCode 其他持久化字段（`createdAt`、`updatedAt`、`acpSessionId` 等）的驼峰风格不一致。

`config_options` 的 snake_case 规定来自历史决策（与 `available_commands` 保持一致），但 `available_commands` 本身也是 ACP agent 返回值的直接透传，并非 FylloCode 主动声明的字段。本次统一规范后，FylloCode 主动声明的字段一律驼峰，ACP agent 返回值的内部结构（option 对象的 key）不受约束。

## Goals / Non-Goals

**Goals:**

- 将 `SessionMeta` 落盘字段 `config_options` 重命名为 `configOptions`
- 将 `registry-cache.json`、`status-cache.json`、`installed.json` 中的时间字段改为 ISO 8601 字符串
- 新增 guideline 文档固定持久化层命名规范，防止未来回退

**Non-Goals:**

- 不迁移已存在的 `data/` 目录下的 JSON 文件（开发环境数据，重启后自动重建）
- 不修改 ACP agent 返回值内部的字段命名（`available_commands`、option 对象内部 key 等）
- 不修改 IPC 通道名称（`config_options_update` 等 event type 字符串来自 ACP 协议，不在本次范围）

## Decisions

**决策 1：`config_options` 改为 `configOptions`，`available_commands` 保持不变**

`available_commands` 是 ACP agent 返回值的直接透传，FylloCode 只是原样存储，不主动声明其结构。`config_options` 同理，但其落盘 key 是 FylloCode 在 `SessionMeta` 类型中主动声明的，属于 FylloCode 自己的持久化契约，应遵循驼峰规范。

**决策 2：时间字段改为 ISO 8601 字符串，不使用 `Date` 对象**

ISO 字符串对人类可读，与 `sessions/*.json` 等已有文件保持一致，且 JSON 序列化无歧义。`Date` 对象在 JSON 中序列化为字符串，但读取时需手动转换，增加负担。

**决策 3：`fetchedAt` 类型从 `number` 改为 `string`**

`registry-cache.json` 和 `status-cache.json` 的 `fetchedAt` 用于 TTL 判断（`Date.now() - fetchedAt > TTL`），改为 ISO 字符串后需改为 `Date.now() - new Date(fetchedAt).getTime() > TTL`，逻辑等价，无功能影响。

**决策 4：guideline 放在 `guidelines/PersistFieldNamingConventions.md`**

与现有 guideline 文件命名风格一致（PascalCase 文件名）。

## Risks / Trade-offs

- **已有 data 文件不迁移**：开发环境重启后缓存文件会以新格式重建，无需手动处理。生产环境升级时，旧格式的 `fetchedAt`（number）读取后 `new Date(number)` 仍能正确解析，向后兼容。`config_options` 字段重命名后旧文件中的 `config_options` 字段会被忽略（读取时 `configOptions` 为 `undefined`），session 重新打开后会从 ACP agent 重新获取，可接受。
- **测试文件改动量较大**：`config-option-service.spec.ts` 中多处 `makeMeta({ config_options: ... })` 需同步更新，但改动机械，无逻辑风险。

## Migration Plan

1. 修改 `SessionMeta` 类型及所有读写代码
2. 修改缓存文件的时间字段写入逻辑
3. 更新相关测试
4. 新增 guideline 文档
5. 更新三个受影响的 spec 文件

无需数据库迁移脚本，无需部署步骤，无需回滚策略（改动为纯代码层，不影响运行时外部依赖）。

## Open Questions

无。
