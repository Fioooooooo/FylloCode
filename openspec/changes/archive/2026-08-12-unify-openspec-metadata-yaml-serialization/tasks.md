## 1. 统一 metadata YAML util

- [x] 1.1 新增 `src/mcp-servers/fyllo-specs/src/runtime-openspec/metadata-yaml.ts`，导出专用于 `.openspec.yaml` 的读取和写入函数；写入函数必须使用 `dump(value, { schema: CORE_SCHEMA })`，读取缺失文件时保持现有 `null` 行为。
- [x] 1.2 修改 `create-change.ts#createChange`、`tasks.ts#loadApplyState` 和 `archive-change.ts#persistArchivedStatus`，全部通过 metadata util 读写 `.openspec.yaml`；移除它们对直接 `js-yaml` 序列化或 `fs.ts#writeYamlFile` 的依赖，并从 `fs.ts` 删除不再使用的通用写入函数。

## 2. 回归测试与验证

- [x] 2.1 更新 `test/mcp-servers/fyllo-specs/openspec-runtime.test.ts`：Create、Apply、Archive fixture 均包含无引号 ISO `created` 与额外 metadata；每条写入路径都断言目标 `status`、原值保留、`created` 不带单引号或双引号，且 preview/失败/idempotent 既有行为保持不变。
- [x] 2.2 先运行 `sh scripts/prepare-worktree-env.sh` 准备 linked worktree，再运行 fyllo-specs 聚焦 Vitest 与 `pnpm typecheck:node`；验收标准为相关测试全部通过且 TypeScript 无新增错误。
