# data-migration 规范

## Purpose

定义应用启动时数据迁移引擎的执行时机、迁移脚本约定、执行记录持久化以及失败隔离策略。

## Requirements

### Requirement: 迁移引擎在启动时自动执行未执行的迁移

主进程 SHALL 在 `app.whenReady()` 后、`createMainWindow()` 前调用迁移引擎。迁移引擎 SHALL 读取 `data/migrations.json` 中的已执行记录与 `baselineId`，对比静态注册的迁移列表，按文件名字母序依次执行尚未执行的迁移。

迁移引擎判断某条迁移是否需要执行的规则（按优先级）：

1. 若迁移 ID ≤ `baselineId`（字母序比较），跳过
2. 若迁移 ID 已在 `executed` 中且 `status === "success"`，跳过
3. 若迁移 ID 已在 `executed` 中且 `status === "failed"`，跳过（不重试）
4. 否则执行

#### Scenario: 新安装首次启动

- **WHEN** `data/migrations.json` 不存在
- **AND** `data/projects/` 目录和 `data/acp/installed.json` 均不存在（判定为新安装）
- **THEN** 迁移引擎 SHALL 不执行任何迁移
- **AND** 将当前注册的最新迁移 ID 写为 `baselineId`，写入 `data/migrations.json`（`executed` 为空数组）

#### Scenario: 老用户升级（首次引入迁移框架）

- **WHEN** `data/migrations.json` 不存在
- **AND** `data/projects/` 目录或 `data/acp/installed.json` 至少一个存在（判定为老用户）
- **THEN** 迁移引擎 SHALL 不设置 `baselineId`，按顺序执行所有已注册迁移
- **AND** 执行完成后将结果写入 `data/migrations.json`（无 `baselineId` 字段）

#### Scenario: 部分迁移已执行（正常升级）

- **WHEN** `data/migrations.json` 存在，`baselineId` 已设置
- **THEN** 迁移引擎 SHALL 跳过 ID ≤ `baselineId` 的迁移及已有 `status: "success"` 记录的迁移
- **AND** 只执行剩余未执行的迁移

#### Scenario: 所有迁移已执行或均在 baseline 内

- **WHEN** 所有已注册迁移均满足跳过条件（baseline 覆盖或已有成功记录）
- **THEN** 迁移引擎 SHALL 不执行任何迁移，直接返回

### Requirement: 迁移脚本约定

每条具体迁移 SHALL 是 `src/main/migrations/scripts/` 目录下的一个 TypeScript 文件，文件名格式为 `YYYYMMDD_NNN_<kebab-case-description>.ts`（如 `20260601_001_config-options-camel-case.ts`）。每个迁移文件 SHALL 导出一个 `migrate(ctx: MigrationContext): Promise<void>` 函数，并 SHALL 通过 `src/main/migrations/types.ts` 中的 `MigrationContext` 类型访问上下文。

`MigrationContext` SHALL 包含：

- `dataPath: string`：`userData` 下 `data/` 目录的绝对路径
- `logger: Logger`：主进程 logger 实例

所有已注册迁移 SHALL 在 `src/main/migrations/scripts/index.ts` 中以有序数组形式静态声明并导出为 `migrations: Migration[]`。数组顺序即执行顺序，SHALL 与具体迁移脚本文件名字母序一致。`src/main/migrations/index.ts` SHALL 作为公开运行入口导入该 `migrations` 数组并传递给迁移引擎。

#### Scenario: 新增迁移脚本

- **WHEN** 开发者新增迁移文件 `src/main/migrations/scripts/20260601_003_foo.ts`
- **THEN** 该文件 SHALL 导出 `migrate(ctx: MigrationContext): Promise<void>`
- **AND** 开发者 SHALL 将其追加到 `src/main/migrations/scripts/index.ts` 的 `migrations` 数组末尾
- **AND** `migrations` 数组中的迁移 ID SHALL 等于脚本文件名去掉 `.ts` 扩展名后的字符串

#### Scenario: 迁移运行入口加载注册数组

- **WHEN** 主进程调用 `@main/migrations` 导出的 `runAllMigrations()`
- **THEN** `src/main/migrations/index.ts` SHALL 从 `src/main/migrations/scripts/index.ts` 导入 `migrations` 数组
- **AND** SHALL 将该数组传递给 `runMigrations`

### Requirement: 执行记录持久化

迁移引擎 SHALL 将每条迁移的执行结果写入 `data/migrations.json`，结构为 `{ baselineId?: string; executed: MigrationRecord[] }`。

`MigrationStore` 结构：

```
{
  baselineId?: string;  // 低于或等于此 ID 的迁移视为已执行，无需运行（新安装时写入）
  executed: MigrationRecord[];
}
```

`MigrationRecord` 结构：

```
{
  id: string;          // 迁移文件名（不含 .ts 扩展名）
  executedAt: string;  // ISO 8601 字符串
  status: "success" | "failed";
  error?: string;      // 仅 status === "failed" 时存在，内容为错误 message 摘要
}
```

#### Scenario: 迁移成功后写入记录

- **WHEN** 某条迁移的 `migrate()` 函数正常返回（无异常）
- **THEN** 迁移引擎 SHALL 向 `data/migrations.json` 追加一条 `{ id, executedAt, status: "success" }` 记录

#### Scenario: 迁移失败后写入记录

- **WHEN** 某条迁移的 `migrate()` 函数抛出异常
- **THEN** 迁移引擎 SHALL 向 `data/migrations.json` 追加一条 `{ id, executedAt, status: "failed", error }` 记录
- **AND** 继续执行后续迁移

### Requirement: 迁移失败不阻止 App 启动

迁移引擎 SHALL 捕获单条迁移的所有异常，记录失败状态后继续执行后续迁移。所有迁移执行完毕后，无论成功或失败，迁移引擎 SHALL 正常返回，不抛出异常，不阻止 `createMainWindow()` 执行。

失败的迁移在后续启动时 SHALL NOT 被重试（避免每次启动都重复失败）。

#### Scenario: 单条迁移抛出异常

- **WHEN** 某条迁移的 `migrate()` 抛出异常
- **THEN** 迁移引擎 SHALL 记录 `status: "failed"` 并打印 `logger.error`
- **AND** 继续执行剩余迁移
- **AND** App 正常启动，`createMainWindow()` 照常执行

#### Scenario: 失败迁移不重试

- **WHEN** `data/migrations.json` 中某条迁移记录为 `status: "failed"`
- **THEN** 迁移引擎 SHALL 跳过该迁移，不重新执行
