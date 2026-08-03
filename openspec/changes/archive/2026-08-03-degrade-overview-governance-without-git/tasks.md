## 1. Git history availability 与默认值

- [x] 1.1 修改 `src/main/services/insight/overview/git-stats.ts`：增加可由测试注入/观察的 Git history availability probe，使用 Project 根 `.git` 是否存在以及 `git rev-parse --verify --quiet HEAD` 的 exit code 区分普通非 Git、无首个 commit、可用 history 和真实错误；`.git` 的非 ENOENT I/O 错误、Git 进程启动失败及非预期 exit code 必须继续抛出，禁止通过 stderr 文案匹配分类。
- [x] 1.2 修改 `getGitGovernance()`：history unavailable 时返回 `{ specsGrowth: [], recentGuidelines: [], guidelinesLastUpdated: null }`，且不把该默认结果写入现有 60 秒 cache；history available 时保持 `computeSpecsGrowth()`、`computeRecentGuidelines()` 和成功结果 cache 不变，真实 history 读取失败继续 reject。
- [x] 1.3 修改 `src/main/services/insight/overview/archive-commit-index.ts` 复用同一 availability probe：普通非 Git 或无首个 commit 时直接返回空 Map 且不记录 failure warning；history available 后 `git log` 失败仍沿用现有 warning + 空 Map 降级，并保持 persisted `commitHash` 优先级和 `RecentLineage.archiveCommitHash: null` 契约不变。

## 2. Overview 行为回归测试

- [x] 2.1 扩展 `test/main/services/insight/overview/git-stats.spec.ts`，覆盖普通非 Git 目录返回默认值、`git init` 后无 HEAD 返回默认值、默认结果不缓存、linked worktree `.git` file 可识别、有效 HEAD 继续计算历史，以及损坏/权限/启动/超时或非预期 exit code 不被默认值吞掉。
- [x] 2.2 扩展 `test/main/services/insight/overview/archive-commit-index.spec.ts` 与 `overview-service.spec.ts`：证明 non-Git/unborn Project 的 archive enrichment 返回 null 且不产生预期错误 warning；文件系统治理读取成功时 Project 保持 `ready`、计入 specs/archive/guideline/proposal 汇总并保持 complete；有效 Git repository 的真实 history failure 仍产生 Folder `error` 与 partial completeness。
- [x] 2.3 更新 `test/renderer/src/pages/overview.spec.ts` 的契约回归：complete aggregate 携带空 `specsGrowth`、空 `recentGuidelines` 和 null/zero history 派生值时不显示 `overview-partial-alert`，而现有 partial aggregate 仍显示“Repository 治理数据不完整”及未计入 Project；不得修改 Overview 页面布局或 shared response schema。

## 3. 验证

- [x] 3.1 运行 `test/main/services/insight/overview/git-stats.spec.ts`、`archive-commit-index.spec.ts`、`overview-service.spec.ts` 和 `test/renderer/src/pages/overview.spec.ts` 的聚焦 Vitest；随后运行全量 `pnpm test`、`pnpm typecheck`、`pnpm lint`、受影响文件 Prettier 检查和 `git diff --check`，修复所有失败。不得运行 `pnpm build` 或启动 `pnpm dev`。
