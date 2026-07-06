## Context

`archive-change` 是 proposal Archive stage 的主路径。当前归档流程由两层提示共同影响 agent 行为：

- MCP tool 层：`src/mcp-servers/fyllo-specs/src/tools/archive-change.ts` 暴露 `commitMessage` 字段描述，`src/mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md` 返回 archive workflow instruction。
- FylloCode stage 层：`src/main/services/chat/system-reminder/templates/archive.txt` 注入 Archive stage system reminder。

归档 runtime 会在 `src/mcp-servers/fyllo-specs/src/runtime-workspace/git.ts` 中执行 `git add -A`，再用 `commitMessage` 创建最终提交。因此该提交覆盖 proposal 实际代码/测试/spec 变更以及 archive finalization diffs，不是一个仅记录“移动到 archive 目录”的提交。

## Goals / Non-Goals

**Goals:**

- 让 `commitMessage` 的提交主题描述 proposal 实际交付内容，例如 `feat(fyllo-specs): make explore workspace-aware`。
- 保留 archive/sync 事实在正文 bullet 或最终汇报中的表达能力。
- 更新测试样例，避免测试继续暗示 `chore(specs): archive ...` 是推荐写法。
- 保持现有归档顺序、输入字段、返回结构和格式校验不变。

**Non-Goals:**

- 不新增运行时语义校验，例如拒绝 subject 中出现 `archive`。
- 不改变 `commitMessageSchema` 的 `type(scope): summary` 格式规则。
- 不调整 OpenSpec archive CLI、spec sync、workspace finalization、merge/rebase/cleanup 行为。
- 不重新设计 Archive stage 的完整交互流程。

## Decisions

### Decision 1: 修改提示源，而不是运行时拒绝

更新 `archive-change` schema 描述、tool instruction 和 Archive stage reminder，让 agent 在生成 `commitMessage` 时优先使用 proposal、diff 和已完成任务来命名提交。当前没有稳定手段可靠判断一句 subject 是否真实描述了 proposal 交付内容，运行时拒绝容易误伤合法提交，因此不做语义拒绝。

### Decision 2: 提交主题描述交付内容，archive/sync 放在正文或汇报

Archive stage 仍然需要向用户报告 archive location、spec sync、workspace finalization 和 commit message used，但 commit subject 本身不应被描述为 archive/sync action。可接受的多行提交信息形态是：

```text
feat(fyllo-specs): clarify archive commit guidance

- synced fyllo-specs-archive spec
- archived clarify-archive-commit-message
```

不可接受的推荐样例是：

```text
chore(specs): archive clarify-archive-commit-message
```

### Decision 3: 测试样例承担“推荐形态”职责

现有测试只验证工具成功归档，不断言 commit subject 语义；但测试 fixture 会被 agent 和维护者读取。将样例改为 proposal 交付语义，避免在代码库中保留会诱导错误输出的示例。

## Risks / Trade-offs

- 仅改提示不能 100% 阻止未来 agent 写错提交主题。缓解方式：在 schema、tool instruction、stage reminder 和测试样例中同时给出一致约束。
- 多行 commit message 当前通过 `git commit -m <message>` 传递，正文可用但格式仍需满足仓库 commit-msg hook。缓解方式：提示只允许可选正文 bullet，并保持 subject 符合 `type(scope): summary`。
- 如果未来需要强校验，可能要引入 proposal metadata、changed-file summary 或人工确认机制；本次先不做，以免引入不稳定判断。
