## Why

Project 可以是普通非 Git 工程目录，但项目概览当前将 Git history 查询与 specs、archives、guidelines、proposal 等文件系统治理读取绑定为同一个 Folder reader；非 Git Project 因此被整体标记为 error，并显示“Repository 治理数据不完整”。应只降级依赖 Git history 的演进字段，保留非 Git Project 可直接读取的治理数据。

## What Changes

- 将普通非 Git Project 和尚无首个 commit 的 Git Project 视为“没有可用 Git history”，为规约增长、准则演化、最近更新时间与本月规约增量返回现有契约支持的空值，而不是让整个 Folder governance reader 失败。
- 非 Git Project 仍读取并汇总当前 specs、archives、guidelines 数量和本地 proposal；只要这些读取成功，该 Project 在 Overview repository aggregate 中保持 `ready`，不触发 partial completeness。
- 保留真实异常语义：对于已经具有 Git history 的 repository，Git 仓库损坏、权限错误、子进程启动失败或命令超时仍返回 Folder `error`，并让 Overview 显示 partial completeness。
- 保持 archive commit 追溯的现有安全降级：无法从 Git history 解析 commit 时继续返回 `archiveCommitHash: null`，不阻塞 recent lineage。
- 不改变 Project/Workspace identity、存储、IPC channel 或现有 `ProjectOverview` 数据结构。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-overview`: 调整 repository governance 的 ready/partial 边界，使缺少 Git history 的 Project 使用默认演进值，同时保留可直接读取的治理统计；真实 Git 故障仍保持 error。

## Impact

- Main：`src/main/services/insight/overview/git-stats.ts`、`overview-service.ts` 的 Git history 能力判断与默认值投影。
- Tests：`test/main/services/insight/overview/git-stats.spec.ts`、`overview-service.spec.ts`，必要时补充 renderer partial alert 回归测试。
- Specs：修改 `project-overview` 的静态治理与 repository governance 读取契约。
- 无新依赖、数据迁移或 shared schema 变更。
