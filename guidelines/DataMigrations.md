---
name: Data Migrations
description: Governs main-process upgrade migrations, migration identifiers and ordering, execution records, script safety, and focused verification.
keywords: [migration, data, storage, upgrade, main]
---

# Data Migrations

## 范围

- 覆盖：`src/main/migrations/**`、迁移在 main bootstrap 中的执行时序，以及 `test/main/migrations/**` 下的验证。
- 不覆盖：新增或改变持久化格式本身的行为契约。持久化 path、JSON key、schema 或迁移框架语义发生变化时，先按 OpenSpec proposal 明确兼容要求；另见 `guidelines/MainProcess.md`。

## 执行模型

- `src/main/index.ts` 在加载 `@main/bootstrap` 前同步取得 Electron 单实例锁；未取得锁的进程不会加载 migration runner 或其他启动期 app-data writer。该进程级门控是以下迁移执行模型的前置条件。
- `src/main/bootstrap/index.ts` 在 `syncShellPath()` 之后 `await runAllMigrations()`，并在 bundled MCP host、IPC handler、窗口和 Agent 预热启动之前完成迁移。
- `src/main/migrations/index.ts` 只负责把 `scripts/index.ts` 的注册表交给 `runMigrations()`。
- `src/main/migrations/runner.ts` 将账本写入 `getDataSubPath("migrations")/migrations.json`。账本由可选的 `baselineId` 和 `executed` 记录组成。
- 没有迁移账本，且 `projects` 目录与 `acp/installed.json` 都不存在时，runner 将当前最后一个迁移 ID 记为 `baselineId`，新安装不会执行历史迁移。
- 没有迁移账本，但存在上述任一旧数据标记时，runner 视为旧版本升级并尝试执行全部已注册迁移。
- runner 跳过 `id <= baselineId` 的迁移，也跳过 `executed` 中已经出现的任意 ID。失败记录同样不会在后续启动自动重试。
- 单个迁移抛错时，runner 记录 `failed` 和错误消息、继续执行后续迁移，并在每次尝试后立即持久化账本；runner 不把单个迁移失败继续抛给 bootstrap。

证据：`src/main/bootstrap/index.ts`、`src/main/migrations/runner.ts`、`src/main/migrations/store.ts`、`src/main/migrations/types.ts`、`test/main/migrations/runner.spec.ts`。

## 规则

### 迁移标识与注册

- MUST 将新脚本放在 `src/main/migrations/scripts/`，文件名使用 `YYYYMMDD_NNN_<description>.ts`；迁移 `id` 必须等于不含 `.ts` 的文件名。八位日期和三位同日序号保证字符串排序与执行顺序一致。证据：`test/main/migrations/scripts-index.spec.ts`。
- MUST 从脚本导出与 `Migration["migrate"]` 兼容的异步 `migrate` 函数，并在 `src/main/migrations/scripts/index.ts` 显式 import、按文件名字母序追加到 `migrations` 数组末尾。不得只新增文件而遗漏注册。证据：`src/main/migrations/types.ts`、`src/main/migrations/scripts/index.ts`、`test/main/migrations/scripts-index.spec.ts`。
- MUST 把已发布迁移的 ID 和含义视为不可变。需要修正已发布迁移时新增更晚的迁移，不得重命名旧文件、复用旧 ID 或依赖修改旧脚本再次执行；runner 会永久跳过已记账 ID。证据：`src/main/migrations/runner.ts` 的 `shouldSkip()`、`test/main/migrations/runner.spec.ts`。
- MUST 让依赖关系体现在 ID 与注册顺序中；后续迁移只能依赖更早迁移已经建立的数据形态，不得依赖文件系统未保证的目录遍历顺序。证据：`src/main/migrations/runner.ts`、`test/main/migrations/scripts-index.spec.ts`。

### 脚本安全

- MUST 通过 `getDataSubPath()` 定位应用数据，不得硬编码开发或生产数据根目录。证据：`src/main/migrations/runner.ts`、`src/main/migrations/scripts/20260601_001_config-options-camel-case.ts`、`src/main/migrations/scripts/20260601_002_installed-at-iso.ts`。
- MUST 只转换能够明确识别的旧数据形态，并让目标不存在、字段不匹配或记录已经迁移时安全地 no-op。迁移可能面对空目录、部分升级或混合版本数据。证据：两个现有迁移分别检查 `config_options` 是否存在和 `installedAt` 是否为 number。
- MUST 保留无关字段和记录；不得用新默认对象覆盖整份旧数据。只有检测到目标变化时才写回。证据：`20260601_001_config-options-camel-case.ts` 使用 rest 保留字段，`20260601_002_installed-at-iso.ts` 使用 `changed` 控制写回。
- SHOULD 隔离可独立处理的文件或记录，使单个缺失、不可读或不可解析的输入不会阻止其余数据迁移。若无法安全判断旧数据，应保留原数据而不是猜测转换。证据：`20260601_001_config-options-camel-case.ts` 对项目、session 目录和单个 session 文件分别容错。
- MUST 让意外写入失败继续抛给 runner 记录为 `failed`；不得吞掉写错误后让账本误记为 `success`。由于失败 ID 不会自动重试，迁移在写入前应尽量完成校验，并将可重复执行作为默认设计目标。证据：现有脚本只对读取/解析容错，写入错误会传播到 `runMigrations()`。
- MUST NOT 依赖 IPC handler、BrowserWindow、bundled MCP host、renderer 或 Agent 连接已经初始化；迁移执行时这些能力尚未启动。证据：`src/main/bootstrap/index.ts`、`test/main/bootstrap/index.spec.ts`。

### 框架与兼容边界

- MUST 依赖 `src/main/index.ts` 的单实例门保证同一时间只有持锁主实例进入 `runAllMigrations()`；Workspace cutover 等业务迁移不得另建持久化锁文件或跨进程锁来替代、绕过该启动门控。需要改变单实例或迁移并发语义时，必须先通过独立 OpenSpec proposal 明确契约。证据：`src/main/index.ts`、`src/main/bootstrap/index.ts`、`test/main/index.spec.ts`、`openspec/specs/single-instance-startup/spec.md`。
- MUST 在新增迁移前检查旧版本用户是否可能只有 `projects` 和 `acp/installed.json` 之外的目标数据。如果现有新安装判定会把这类用户误判为 fresh install，不得只增加脚本；应先通过 proposal 明确并调整 baseline 判定。证据：`src/main/migrations/runner.ts` 的 `isNewInstall`。
- MUST NOT 在普通迁移脚本变更中顺带改变账本 schema、baseline 规则、失败后继续/不重试语义或 bootstrap 执行时序。这些变化会改变持久化与升级契约，必须先通过 OpenSpec proposal 收敛并补齐 runner 测试。证据：`src/main/migrations/types.ts`、`src/main/migrations/runner.ts`、`test/main/migrations/runner.spec.ts`。

## 测试与验证

- MUST 保持 `test/main/migrations/scripts-index.spec.ts` 通过；它会校验所有符合命名规则的脚本都按文件名顺序注册。
- SHOULD 为非平凡迁移在 `test/main/migrations/scripts/` 添加聚焦测试，至少覆盖旧形态转换、已迁移数据 no-op、缺失或不可解析输入，以及无关字段保留。
- 修改 runner 或 store 时，MUST 覆盖 fresh-install baseline、旧用户全量执行、baseline 跳过、已记账跳过、失败后继续和失败不重试。证据：`test/main/migrations/runner.spec.ts`。

```bash
pnpm exec vitest run --project main test/main/migrations
pnpm typecheck:node
pnpm lint
```

## 失效信号

- 当 `src/main/bootstrap/index.ts`、`src/main/migrations/**`、`src/main/infra/paths/index.ts` 或 `test/main/migrations/**` 的启动顺序、路径、账本结构、跳过条件或注册方式变化时，重新检查本文档。
