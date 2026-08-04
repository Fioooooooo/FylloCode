## Why

尚未发布的 Cortex Workspace-scope 迁移会把缺少 `folderId` 的 legacy proposal lineage 一律视为 owner 不可证明，即使 Folder Workspace 只有一个可用成员；随后严格的 lineage reader 会过滤这些 link，导致 Chat EventRail、Overview 与 Lineage Browser 丢失仍然存在于 subject 文件中的 proposal 关联。迁移实现需要与“只转换可证明唯一 owner、不得猜测 primary”的既有工程约束对齐，并在 multi-root Workspace 中保留歧义保护。

## What Changes

- 修正未发布的 `20260803_001_cortex-workspace-scope`：为 ownerless legacy proposal link 解析可证明唯一的 Folder owner，并把 `folderId` 原子写回 subject。
- Folder Workspace 的唯一可用成员直接构成 owner 证据；Collection Workspace 仅在 proposal 的 active/archive repository evidence 唯一命中一个可用成员时补写 owner，零命中或多命中继续保留原 link 并产生 warning。
- 使用补全后的 subject 稳定重建 Workspace lineage v2 composite index，并向 owner Folder reverse index 幂等写入 proposal/commit origin；已有冲突 origin 保留且报告 warning。
- 保持完整 `ProposalRef`、严格 lineage reader、migration runner/ledger、启动顺序以及已发布 Workspace cutover/retirement 迁移不变。
- 增加迁移回归测试，并在 Apply 阶段提供一个不进入仓库与产品分发的临时本地修复脚本：默认 dry-run，apply 前备份目标文件，只处理指定 Workspace/Folder，并验证 subject 与两级 index。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `repository-lineage`：ownerless legacy proposal 在 Folder owner 可由 Workspace 唯一成员或唯一 repository evidence 证明时必须补全并进入 owner-qualified indexes；真正歧义的数据仍不得猜测。

## Impact

- 行为契约：`openspec/specs/repository-lineage/spec.md`。
- 迁移实现：`src/main/migrations/scripts/20260803_001_cortex-workspace-scope.ts`。
- 测试：`test/main/migrations/scripts/cortex-workspace-scope.spec.ts`，以及必要的 lineage browser/overview/session 回归断言。
- 本地运维：Apply 阶段在系统临时目录生成并运行一次性修复脚本，目标为用户明确指定的 FylloCode app-data Workspace；脚本及备份不提交到仓库。
- 不影响：IPC/preload API、renderer `ProposalRef` 类型、正常运行期 lineage 写入、migration ledger schema、已发布 migration ID、外部依赖与用户可见交互。
