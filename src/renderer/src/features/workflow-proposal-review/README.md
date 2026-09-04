# Workflow Proposal Review

Workflow proposal 的独立审阅 feature。Main 返回的 `WorkflowProposalDetail` 是提案 YAML 与状态的唯一事实源；feature 通过独立的 `workflow-proposal` Pinia store 管理按 Workspace/parent/proposal 隔离的 projection、interest 生命周期和 wake + pull 更新。

确认卡片完整展示 proposal YAML，并以竖向时间线呈现 stage 拓扑；proposal 与 Workflow Run 入口、store、wake 信道彼此独立。确认只负责把 definition 保存到 session shadow 或 workspace 正式资产，实际执行仍由后续 `trigger_workflow` 负责。

本 feature 不负责 WorkflowEngine 执行、Run snapshot 写入、MCP tool 调用或 workflow definition 编辑。
