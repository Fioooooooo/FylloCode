## 1. shared 类型扩展

- [x] 1.1 在 `shared/types/proposal.ts` 的 `ProposalMeta` interface 中追加 `worktreePath?: string` 字段，紧跟 `date` 字段之后。
- [x] 1.2 在 `shared/types/proposal.ts` 的 `ApplyRunMeta` interface 中追加 `worktreePath?: string` 字段，紧跟 `updatedAt` 之后。
- [x] 1.3 验收：`pnpm typecheck` 通过；`shared/types/proposal.ts` 中两处 `worktreePath?: string` 字段存在。

## 2. fyllo-specs MCP：targetPath 必填校验

- [x] 2.1 在 `mcp-servers/fyllo-specs/src/utils/project-root.ts` 内新增 `validateTargetPath(targetPath: string): { ok: boolean; resolved?: string; rawOutput?: string; error?: string }` 函数。实现：
  - 入参先 `path.isAbsolute` 校验，非绝对返回 `{ ok: false, error: "targetPath must be an absolute path" }`。
  - `const resolved = path.resolve(targetPath)`。
  - 通过 `child_process.spawnSync("git", ["-C", process.env.FYLLO_PROJECT_PATH ?? "", "worktree", "list", "--porcelain"], { encoding: "utf8" })` 取 stdout。
  - spawn 退出码为 0 时：解析 stdout 中所有 `worktree <abs-path>` 行，提取路径集合并 `path.resolve` 规范化；若 `resolved` 在集合中则返回 `{ ok: true, resolved }`，否则返回 `{ ok: false, rawOutput: stdout, error: "targetPath is not a registered git worktree" }`。
  - spawn 退出码非 0（典型 non-git 项目，无 `.git`）：当 `resolved === path.resolve(process.env.FYLLO_PROJECT_PATH ?? "")` 时退化为合法，返回 `{ ok: true, resolved }`；否则 `{ ok: false, rawOutput: stderr, error: "targetPath must be the project root for non-git projects" }`。
- [x] 2.2 在 `mcp-servers/fyllo-specs/src/tools/explore.ts` 的 `exploreInputSchema` 中追加 `targetPath: z.string().min(1).describe("Absolute path to the project root or a registered git worktree.")`。在 handler 中：先用 `validateTargetPath(input.targetPath)` 校验；不通过时通过 `runTool` 抛 `Error` 让 `runTool` 内敛到 `state.errors`，error 类型用 `InvalidTargetPath`，message 包含 `result.error` 与 `result.rawOutput`（如有）；通过则把 `projectRoot` 替换为 `result.resolved`，不再调 `resolveProjectRoot()`。
- [x] 2.3 在 `mcp-servers/fyllo-specs/src/tools/create-proposal.ts` 的 `createProposalInputSchema` 中追加 `targetPath` 字段（同 2.2）。handler 内部 `projectRoot = result.resolved`；保留现有 `createChange(projectRoot, name)` 流程。**禁止**任何 git worktree add 副作用——P1 阶段 create-proposal 不引入 worktree 创建。
- [x] 2.4 在 `mcp-servers/fyllo-specs/src/tools/apply-change.ts` 的 `applyChangeInputSchema` 中追加 `targetPath` 字段（同 2.2）。handler 内部 `projectRoot = result.resolved`；保留 `existsSync(changeDir(projectRoot, ...))` 与 `loadApplyState(projectRoot, ...)` 调用。
- [x] 2.5 在 `mcp-servers/fyllo-specs/src/tools/archive-change.ts` 的 `archiveChangeInputSchema` 中追加 `targetPath` 字段（同 2.2）。handler 内部 `projectRoot = result.resolved`。**禁止**任何 git commit/merge/worktree remove/branch delete 副作用——P1 阶段 archive-change 仅做 OpenSpec 文件归档。
- [x] 2.6 4 个 tool 的 prompt md 文件（`mcp-servers/fyllo-specs/src/prompts/{explore,create-proposal,apply-change,archive-change}.md`）开头的"Input"段都要更新：明确说明 `targetPath` 必填，必须是绝对路径，必须是 main repo 或已注册的 worktree；P1 阶段 agent 默认传 `$FYLLO_PROJECT_PATH`（即主仓库根）。
- [x] 2.7 在 `mcp-servers/fyllo-specs/__tests__/tools.test.ts` 增加测试用例：
  - explore / create-proposal / apply-change / archive-change 任一调用缺省 `targetPath` → MCP SDK 拦截返回 `InvalidParams`。
  - 传入相对路径 → `state.errors[0].type === "InvalidTargetPath"`。
  - 传入不存在的绝对路径 → `state.errors[0].type === "InvalidTargetPath"`，message 含 `git worktree list --porcelain` 的输出片段。
  - 传入 `targetPath === FYLLO_PROJECT_PATH`（git 项目）→ 正常进入 handler。
  - non-git 项目（mock `<FYLLO_PROJECT_PATH>/.git` 不存在）传入 `FYLLO_PROJECT_PATH` → 走降级逻辑，handler 正常执行；传入其他路径 → `InvalidTargetPath`。
  - 路径含 trailing slash → 校验通过（path.resolve 剥离）。
- [x] 2.8 验收：`pnpm test mcp-servers/fyllo-specs` 全过；4 个 tool 的 input schema 中 `targetPath` 为 zod required string；handler 内部不再出现 `resolveProjectRoot()` 调用（仅 `validateTargetPath` 内部使用 `process.env.FYLLO_PROJECT_PATH`）。

## 3. SystemReminderContext 扩展

- [x] 3.1 在 `electron/main/services/chat/system-reminder/types.ts` 的 `SystemReminderContext` interface 中追加 `worktreePath?: string` 字段，紧跟 `runId?` 之后。
- [x] 3.2 验收：`pnpm typecheck` 通过；P1 阶段不修改任何 system-reminder template 文件（chat.txt / apply.txt / archive.txt）。

## 4. apply-run-service 透传 worktreePath

- [x] 4.1 在 `electron/main/services/proposal/apply-run-service.ts` 的 `createApplyRun` 函数内构造 `runMeta` 时，加载对应 ProposalMeta 并把 `proposalMeta.worktreePath` 透传到 `runMeta.worktreePath`。具体实现：
  - 通过 `findProposalMetaById(projectPath, input.changeId)`（若不存在的辅助函数，则在 `electron/main/domain/proposal/openspec-reader.ts` 内补一个 `findProposalMetaById(projectPath, changeId)`，复用 `readProposalFiles` + `find`）拿到 ProposalMeta；P1 阶段该字段始终为 `undefined`。
  - `runMeta.worktreePath` 写入前用 `path.resolve(proposalMeta.worktreePath)` 规范化（仅在非 undefined 时）。
- [x] 4.2 在 `electron/main/services/proposal/__tests__/apply-run-service.spec.ts` 新建测试文件（如目录不存在则同时创建），覆盖：
  - ProposalMeta.worktreePath 为 undefined 时，新写入的 run.json 不包含 `worktreePath` 键（JSON.stringify 省略）。
  - ProposalMeta.worktreePath 含 trailing slash 时，新写入的 run.json 中 worktreePath 已规范化（无 trailing slash）。
  - ProposalMeta.worktreePath 为绝对路径时，run.json 中字符串严格相等（path.resolve 后）。
- [x] 4.3 验收：`pnpm test electron/main/services/proposal` 全过；新写入的 run.json 在 P1 阶段实际不包含 worktreePath 字段（因 ProposalMeta.worktreePath 始终 undefined）。

## 5. proposal-apply.ts cwd 取值与 reminderContext

- [x] 5.1 在 `electron/main/ipc/proposal-apply.ts` 的 `proposal:stageStream` handler 中，把 `new AcpSession({ ..., cwd: projectPath, ... })` 的 `cwd` 改为 `cwd: runMeta.worktreePath ?? projectPath`。`projectPath` 字段保持不变（仍传主仓库 path）。
- [x] 5.2 在同一处把 `reminderContext` 的字段从 `{ changeId: form.changeId, stageIndex: form.stageIndex, runId: form.runId }` 改为 `{ changeId: form.changeId, stageIndex: form.stageIndex, runId: form.runId, worktreePath: runMeta.worktreePath }`。
- [x] 5.3 在 `proposal:archive` handler 中，找到 `new AcpSession(...)` 创建处，同样把 `cwd: projectPath` 改为 `cwd: runMeta.worktreePath ?? projectPath`，`reminderContext` 增加 `worktreePath: runMeta.worktreePath`。
- [x] 5.4 stage stream handler 当前在 `onReady` 里需要拿到 `runMeta`：检查现有逻辑是否已经 `loadApplyRunMeta` 了 runMeta；若未加载（早期实现仅用 form 字段构造 prompt），则在 `onReady` 早期阶段补一次 `const runMeta = await loadApplyRunMeta(projectPath, form.changeId)`，仅用其 worktreePath 字段；若 `runMeta` 为 null（异常状态）则按现有 cwd 行为 fallback 到 `projectPath`。
- [ ] 5.5 验收：手工 dry-run（启动 FylloCode → 创建 git 项目 → 走一次完整 apply → archive 流程），确认旧 ApplyRunMeta 加载与新流程行为完全等价；`pnpm typecheck` 通过。

## 6. apply-run-store 序列化兼容性

- [x] 6.1 在 `electron/main/infra/storage/apply-run-store.ts` 中确认 `loadApplyRunMeta` 实际是 `JSON.parse` + 类型断言，缺字段 `worktreePath` 时返回 `undefined`。无需改动；如有显式 schema 校验（如 zod），则在 schema 中追加 `.worktreePath: z.string().optional()`。
- [x] 6.2 确认 `saveApplyRunMeta` 实际为 `JSON.stringify(runMeta)`；当 `runMeta.worktreePath === undefined` 时键被自然省略。无需改动；若实现使用 `JSON.stringify(runMeta, null, 2)`，行为相同。
- [x] 6.3 在 `electron/main/infra/storage/__tests__/apply-run-store.spec.ts`（如不存在则新建）增加测试：
  - 写入 ApplyRunMeta 不含 worktreePath → 读回 `worktreePath === undefined`。
  - 模拟磁盘上已存在的旧 run.json（不含 worktreePath 字段）→ 加载后 `worktreePath === undefined`。
  - 写入含绝对 worktreePath 的 ApplyRunMeta → 读回字符串严格相等。
- [x] 6.4 验收：`pnpm test` 中 apply-run-store 相关测试全过。

## 7. dogfood 与零回归验证

- [ ] 7.1 启动 FylloCode 开发环境（`pnpm dev`），打开任意 git 项目，触发一次 chat → create-proposal 调用，确认 fyllo-specs MCP 调用成功（agent 在新 schema 下传入 `targetPath: <projectPath>`，工具正常返回 state）。
- [ ] 7.2 同一项目跑一次 apply（任意 stage）→ archive 流程，确认 stage stream 与 archive stream 正常完成；`run.json` / `archive.json` 落盘字段无 `worktreePath` 噪声。
- [ ] 7.3 用旧版 FylloCode 已经留下的 ApplyRunMeta JSON（手工准备一份不含 worktreePath 的 run.json），加载后跑一次 archive，确认行为零回归。
- [x] 7.4 `pnpm build` 与 `pnpm lint` 通过（不引入新的告警）。
- [ ] 7.5 验收：所有 7.1–7.4 检查通过；FylloCode 应用本身可用，所有 apply / archive 历史数据可正常加载。
