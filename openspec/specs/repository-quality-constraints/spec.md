# repository-quality-constraints 规范

## Purpose

定义仓库质量门禁的硬性约束，包括类型感知 ESLint、可失败的 coverage 阈值，以及与 guideline 文档的同步要求。

## Requirements

### Requirement: ESLint 必须对 TypeScript 与 Vue 源文件启用类型感知规则

仓库 SHALL 在 `eslint.config.mjs` 中为 `*.ts`、`*.mts`、`*.tsx`、`*.vue` 源文件启用基于 TypeScript program 的 type-checked 规则集，且该配置 MUST 接通仓库的 TypeScript project 信息，而不是停留在仅语法级的推荐规则。

#### Scenario: 源文件规则集接通 TypeScript 项目信息

- **WHEN** 实施者检查 `eslint.config.mjs`
- **THEN** TypeScript 相关配置使用 `recommendedTypeChecked` 或等价的类型感知规则集
- **AND** 该配置显式连接仓库的 TypeScript project service / tsconfig 上下文
- **AND** 规则作用范围限定在仓库实际源码文件，而不是依赖生成文件凑分

### Requirement: Coverage 命令必须配置非零且会阻断失败的 aggregate 阈值

仓库 SHALL 在 `vitest.config.mts` 中为 aggregate coverage 配置明确的 minimum threshold；`pnpm test:coverage` MUST 在 statements、branches、functions、lines 任一指标低于阈值时以非 0 退出。初始阈值 MUST 为非零，且 MUST 设为当前仓库实测 coverage 可以通过的合理最低线。

#### Scenario: 覆盖率配置包含四项 aggregate 阈值

- **WHEN** 实施者检查 `vitest.config.mts`
- **THEN** coverage 配置包含 statements、branches、functions、lines 四项 aggregate threshold
- **AND** 四项阈值均大于 0

#### Scenario: 覆盖率命令在低于阈值时失败

- **WHEN** 实施者运行 `pnpm test:coverage`
- **THEN** Vitest 使用阈值配置评估 aggregate coverage
- **AND** 任一 aggregate 指标低于阈值时命令以非 0 退出

### Requirement: 仓库 guideline 必须与新增约束保持一致

仓库 SHALL 在 `guidelines/CodeStyle.md`、`guidelines/Testing.md` 以及必要时 `guidelines/DeveloperWorkflow.md` 中记录新增的类型感知 lint 和 coverage threshold 约束、验证命令与目标配置文件，避免文档继续描述过时的工程基线。

#### Scenario: CodeStyle 文档同步类型感知 lint

- **WHEN** 实施者更新完成后检查 `guidelines/CodeStyle.md`
- **THEN** 文档明确说明 ESLint 对 TypeScript/Vue 源文件启用了类型感知规则
- **AND** 文档引用的验证命令与仓库实际脚本一致

#### Scenario: Testing 文档同步 coverage 阈值

- **WHEN** 实施者更新完成后检查 `guidelines/Testing.md`
- **THEN** 文档明确说明 `pnpm test:coverage` 带有会阻断失败的 aggregate coverage threshold
- **AND** 文档描述与 `vitest.config.mts` 的实际配置一致
