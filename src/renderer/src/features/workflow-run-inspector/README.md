# Workflow Run Inspector

Workflow Run 的独立观察和人工决策 feature。Main 返回的 Run summary/detail 是唯一事实源；feature 通过 `workflow-run` Pinia store 管理按 Workspace/parent/Run 隔离的 projection、interest 生命周期和 wake + pull 更新。

当前范围包括：Run 列表与 detail projection、人工 approve/reject、wake listener 和 Chat 后台活动入口。数据契约位于 `automation:workflow-run:*`，wake 只发送 `{ workspaceId, runId }`，有 interest 时才 pull detail。Workflow-owned fresh session 的 transcript 仍由 Run detail 提供，不进入 spawned-session store、通知或计数。

不在本 feature 范围内：Workflow definition 编辑、WorkflowEngine 执行、Run snapshot 写入、MCP trigger 和 spawned session 语义。
