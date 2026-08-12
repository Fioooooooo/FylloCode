## 1. Chat 阶段按 Folder 拆分 Proposal

- [x] 1.1 修改 `src/main/services/session/chat/system-reminder/templates/chat.txt` 的 `OpenSpec Judgment`：要求 Agent 对 `<workspace>` 中每个受影响 Folder 的 repository-local 改动独立判断 Direct、Plan 或 Proposal；当多个 Folder 达到 Proposal 标准时，在用户确认明确 owner 集合后分别以对应 `folderId` 调用 `mcp__fyllo_specs__create-proposal`；明确禁止把跨 repository 契约变更默认归入 primary Folder，并明确未达到标准的 Folder 仍走 Direct/Plan。验收为 reminder 同时覆盖“两个 owner 都需 Proposal”和“仅一个 owner 需 Proposal”两类 spec 场景。
- [x] 1.2 修改同一 `chat.txt` 的 consent/critical 规则：调用前列出每个 Proposal owner 与 repository-local scope，一次明确同意可覆盖已列出的集合，后续新增 owner 必须重新确认；每份 Proposal artifact 只包含 owner repository 的契约、文件与任务，跨 repository 依赖只记录为显式依赖/顺序。验收为 prompt 不允许把另一 Folder 的文件任务写入当前 Proposal。
- [x] 1.3 修改同一 `chat.txt` 的 `Workspace Policy`：把全部 `state.workspace.path` 引用替换为现有 tool contract 的 `state.target.proposalRef` 与 `state.target.worktreePath`；同一会话存在多个 Proposal 时按完整 ProposalRef 区分，歧义指代必须要求用户明确目标。验收为 Chat reminder 不再包含 `state.workspace.path`。
- [x] 1.4 根据独立 review 收紧 multi-root owner 判断与 consent 信息粒度：在 `chat.txt` 和本 change 的 design/delta specs 中明确契约变更归权威 contract/spec 的 owner Folder、依赖方适配留在依赖方并独立判断轨道；用户确认列表至少包含 Folder 名称、触发 Proposal 的具体契约变化和已知跨 repository 依赖/顺序。

## 2. MCP instruction 防御性说明

- [x] 2.1 修改 `src/mcp-servers/fyllo-specs/src/tools/instructions/create-proposal.md` 的 Input/Guardrails：明确一次 `create-proposal` invocation 只处理一个 repository owner 并只返回一个 `state.target`；当 Chat 已判断多个 Folder 分别需要 Proposal 时，必须为每个 owner 独立调用并显式传 `folderId`。不得在该 instruction 中复制 Direct/Plan/Proposal 门槛或用户确认策略，验收为完整决策仍只由 `chat.txt` 负责。

## 3. 契约测试

- [x] 3.1 扩展 `test/main/services/session/chat/system-reminder/shared.spec.ts` 的 template assertions，锁定逐 Folder 独立判断、禁止 primary umbrella Proposal、单 owner 调用和 `state.target.*` 字段；同时断言模板不再出现 `state.workspace.path`，避免 tool state 术语回退。
- [x] 3.2 扩展 `test/main/services/session/chat/system-reminder/resolve.spec.ts`，新增包含 primary 与 secondary Folder 的 `SessionWorkspaceSnapshot` fixture，并通过 `resolveSystemReminder()` 验证渲染后的 Chat reminder 同时包含完整 Workspace owner 数据、逐 Folder Proposal 策略、owner 集合确认规则和 owner-qualified target tracking；保留既有 section 顺序与 wrapper 断言。
- [x] 3.3 扩展 `test/mcp-servers/fyllo-specs/tools.test.ts` 对 `loadPrompt("create-proposal")` 的断言，锁定 one-owner-per-call、multi-root 分别调用和显式 `folderId` 文案；保留 `test/mcp-servers/fyllo-specs/workspace-scope.spec.ts` 中 multi-root 缺少 owner 不回退 primary 的现有运行时覆盖，不修改 resolver 行为。
- [x] 3.4 扩展 system-reminder template/render tests，锁定 authoritative contract/spec owner 原则、consumer adaptation 独立判断和 consent 列表的三个最小信息字段。

## 4. 验证

- [x] 4.1 若当前 worktree 尚未准备，先运行 `sh scripts/prepare-worktree-env.sh`；随后运行 `pnpm exec vitest run --project main test/main/services/session/chat/system-reminder/shared.spec.ts test/main/services/session/chat/system-reminder/resolve.spec.ts test/mcp-servers/fyllo-specs/tools.test.ts test/mcp-servers/fyllo-specs/workspace-scope.spec.ts` 与 `pnpm typecheck:node`，修复所有真实失败。若测试失败明确来自沙箱网络限制，按权限流程在沙箱外重跑并同时记录首次失败原因与重跑结果。
- [x] 4.2 运行 `pnpm exec prettier --check src/main/services/session/chat/system-reminder/templates/chat.txt src/mcp-servers/fyllo-specs/src/tools/instructions/create-proposal.md test/main/services/session/chat/system-reminder/shared.spec.ts test/main/services/session/chat/system-reminder/resolve.spec.ts test/mcp-servers/fyllo-specs/tools.test.ts openspec/changes/split-multi-root-proposals-by-folder`、`pnpm lint` 和 `git diff --check`；为冷启动全量 lint 预留约 5 分钟。不得运行 `pnpm build`，除非用户针对实现阶段另行明确授权。
- [x] 4.3 重跑 system-reminder 两个 focused tests、`pnpm typecheck:node`、目标文件 Prettier check、`pnpm lint` 与 `git diff --check`，确认 review refinement 没有破坏既有行为；不得运行 `pnpm build`。
