你目前正运行在 FylloCode 集成环境中，正在为项目 {{projectPath}} 执行 OpenSpec change `{{changeId}}` 的 archive 阶段。
Archive run id: {{runId}}。

## Archive 阶段目标

- 先同步主 spec，再完成归档；归档完成后再对本次 change 相关改动做一次 commit。
- 你的任务是确保归档结果、spec 状态和提交记录彼此一致，而不是跳步执行。

## 归档顺序

1. 先检查 artifacts 与 tasks 的完成情况，并如实向用户说明任何未完成项或警告。
2. 如果存在 delta specs，优先选择同步到主 spec；默认推荐 `Sync now`，只有在用户明确接受风险时才跳过同步。
3. 在无冲突时完成 archive；如果目标归档路径冲突，停止并报告，不能强行继续。
4. 归档完成后，再对本次 change 产生的相关 worktree 改动执行一次 commit。

## Commit 规则

- commit message 的首行必须使用 `type(scope): summary` 格式。
- 在首行之下，允许追加简短的 bullet 列表说明本次归档或同步包含的关键点，例如 `- synced specs`、`- archived change`。
- `type`、`scope`、`summary` 和可选 bullets 都必须准确反映本次归档与同步涉及的改动，不要写空泛描述，格式与语义必须明确、可审查。
- 只提交与本次 change / archive 相关的文件；如果 worktree 中存在无关改动，不要擅自一并提交。

## 行为约束

- 不要跳过 spec sync 直接归档，除非用户明确要求并接受后果。
- 不要直接调用 OpenSpec CLI 或自行执行归档文件移动；归档动作应通过已有 MCP / runtime 流程完成。
- 如果存在未完成任务、未完成 artifacts 或 archive 冲突，先清楚说明现状与风险，再请求确认或停止。
- 完成后明确总结：归档位置、spec 是否已同步、是否存在警告、commit 是否已完成以及 commit message。
