## 1. 当前规范

- [x] 1.1 基于已接受的工作流模板要求创建 `openspec/specs/workflow-templates/spec.md`。
- [x] 1.2 在工作流模板规范就位后删除 `openspec/specs/pipeline-templates/`。
- [x] 1.3 删除过时的当前规范目录：`pipeline-page`、`pipeline-runs`、`pipeline-stage-details` 和 `pipeline-stage-visualization`。
- [x] 1.4 更新当前路由规范，使当前项目作用域路由使用 `/workflow`。
- [x] 1.5 更新当前 IPC 规范，使当前领域和通道示例使用 `workflow`，且不暗示存在工作流运行时事件面。
- [x] 1.6 更新当前集成和欢迎页规范，使当前措辞使用工作流术语。

## 2. 指导文件与文档

- [x] 2.1 仅在当前指导内容包含旧术语时更新 `AGENTS.md`。
- [x] 2.2 更新 `docs/Architecture.md` 中的数据目录指导，使其使用工作流术语。
- [x] 2.3 更新 `docs/DataModel.md`，记录当前工作流模板类型，并移除过时的运行和阶段运行时模型章节。
- [x] 2.4 更新 `docs/IPC.md`，记录当前 `window.api.workflow` 通道，并移除过时的运行时通道行。

## 3. 验证

- [x] 3.1 运行 `rg -n "pipeline|Pipeline|PIPELINE" AGENTS.md docs openspec/specs`，确认旧术语只存在于该搜索范围之外的有意归档路径。
- [x] 3.2 运行 `openspec validate align-workflow-specs-docs`。
- [x] 3.3 对当前工作流文档和规范路径做定向仓库搜索，确认 `workflow-templates`、`/workflow`、`WorkflowChannels` 和 `window.api.workflow` 的记录保持一致。
