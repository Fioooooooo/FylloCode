## Why

`archive-change` 的 `commitMessage` 字段本意是让 agent 写本次 proposal 交付内容的提交信息，但当前 tool schema、archive instruction 和 Archive stage reminder 多处强调 archive/sync，导致 agent 生成类似 `chore(specs): archive ...` 的归档摘要。由于 `archive-change` 会对整个 worktree 执行 `git add -A` 并创建最终提交，提交主题应描述 proposal 的实际交付内容，而不是归档动作本身。

## What Changes

- 调整 `archive-change` 的 `commitMessage` 字段描述，明确提交主题必须基于 proposal、已修改文件和实际交付内容。
- 调整 `src/mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md`，要求 archive/sync 只能作为可选正文 bullet 或最终汇报事实出现，不能主导提交主题。
- 调整 Archive stage system reminder 的 Commit Rules，避免把 agent 引向“描述 archive/sync actions”的 subject。
- 更新相关测试样例中的 commit message，使测试不再强化 `chore(specs): archive ...` 这类坏模式。
- 不新增运行时语义拒绝规则；当前没有稳定手段可靠判断提交主题是否描述了 proposal 交付内容。

## Capabilities

### New Capabilities

- `fyllo-specs-archive`: 约束 `fyllo-specs` 的 `archive-change` 工具在归档阶段如何指导 agent 生成最终提交信息。

### Modified Capabilities

无。

## Impact

- 影响 `src/mcp-servers/fyllo-specs/src/tools/archive-change.ts` 的 tool input schema 描述。
- 影响 `src/mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md` 的 archive workflow instruction。
- 影响 `src/main/services/chat/system-reminder/templates/archive.txt` 的 Archive stage reminder。
- 影响 `test/mcp-servers/fyllo-specs/tools.test.ts`、`test/mcp-servers/fyllo-specs/runtime.test.ts` 以及必要时相关 reminder 测试中的提交信息样例。
- 不改变 MCP tool 输入字段、返回结构、归档/同步顺序、git finalization runtime 或 commit message 的格式校验正则。
