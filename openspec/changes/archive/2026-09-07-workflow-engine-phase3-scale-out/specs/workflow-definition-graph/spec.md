## ADDED Requirements

### Requirement: Workflow Editor provides a read-only graph view of the parsed definition

`/workflow` Editor SHALL 提供 YAML 与 Graph 两个视图。Graph SHALL 只根据当前 YAML 成功解析出的 `WorkflowDefinition` 生成 Mermaid 图，并 SHALL 展示每个 stage 的 name/id/kind、pass/fail transition 以及 `maxLoops` 限制。Graph SHALL 是只读视图，不得编辑 definition、执行 workflow、读取 Run detail 或替代 Workflow Run Inspector。

#### Scenario: 用户切换到 Graph view

- **WHEN** 当前 YAML 能被 parser 成功解析且用户打开 Graph tab
- **THEN** Editor SHALL 将该 definition 转换为 Mermaid 图并渲染
- **AND** 图中 SHALL 能区分 stage 节点、pass 边、fail 边和 maxLoops 边信息
- **AND** YAML tab 与 Graph tab SHALL 继续操作同一份 definition 内容

#### Scenario: Graph view 不提供执行编辑操作

- **WHEN** 用户查看 Graph tab 或点击图中的 stage
- **THEN** 图 SHALL 保持只读
- **AND** SHALL 不修改 YAML、启动 Run、打开 Run Inspector 或提供 stage 拖拽编辑

#### Scenario: 无效 definition 或渲染失败

- **WHEN** YAML 解析失败或 Mermaid 渲染失败
- **THEN** Graph view SHALL 显示简单、明确的错误状态
- **AND** SHALL 不渲染过期 definition 的图
- **AND** SHALL 不影响 YAML 编辑、保存和既有 Run Inspector
