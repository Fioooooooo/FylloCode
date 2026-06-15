# persist-field-naming-conventions 规范

## Purpose

定义 FylloCode 主动写入持久化字段的命名与时间字段格式约束，统一使用 camelCase key 和 ISO 8601 时间字符串。

## Requirements

### Requirement: 持久化字段 key 使用驼峰命名

FylloCode 主进程主动声明的持久化字段 key（即在 TypeScript 类型中显式定义、由 FylloCode 代码写入 JSON 文件的字段）SHALL 使用驼峰命名（camelCase）。

本规范适用于所有 `data/` 目录下的 JSON 持久化文件，包括但不限于：`sessions/*.json`、`projects/*/meta.json`、`acp/registry-cache.json`、`acp/status-cache.json`、`acp/installed.json`、`integrations/connections.json`。

以下情况不受本规范约束，按原样存储：

- ACP agent 返回值的内部结构（如 `available_commands` 数组内部的 option 对象字段）
- 第三方协议或外部系统定义的字段名

#### Scenario: 新增持久化字段使用驼峰

- **WHEN** 开发者在任意持久化文件的 TypeScript 类型中新增字段
- **THEN** 该字段 key SHALL 为驼峰命名（如 `configOptions`、`installedAt`、`fetchedAt`），不得使用下划线（如 `config_options`、`installed_at`）

#### Scenario: ACP agent 返回值透传不受约束

- **WHEN** FylloCode 将 ACP agent 返回的数据原样写入持久化文件（如 `available_commands` 数组）
- **THEN** 该数据内部的字段命名不受本规范约束，按 ACP 协议原样存储

### Requirement: 持久化时间字段使用 ISO 8601 字符串

FylloCode 主进程主动声明的时间字段 SHALL 使用 ISO 8601 字符串格式（即 `new Date().toISOString()` 的输出，如 `"2026-06-01T05:38:28.407Z"`），不得使用 Unix 毫秒时间戳数字。

本规范适用于所有 FylloCode 主动写入的时间字段，包括但不限于：`createdAt`、`updatedAt`、`fetchedAt`、`installedAt`、`connectedAt`、`lastOpenedAt`、`capturedAt`。

#### Scenario: 写入时间字段

- **WHEN** 主进程代码写入任意持久化文件的时间字段
- **THEN** 该字段值 SHALL 为 ISO 8601 字符串（如通过 `new Date().toISOString()` 生成），而非 `Date.now()` 返回的数字

#### Scenario: TTL 计算兼容 ISO 字符串

- **WHEN** 主进程需要基于持久化的时间字段计算 TTL 或时间差
- **THEN** SHALL 使用 `Date.now() - new Date(fetchedAt).getTime()` 方式计算，而非直接做数字减法
