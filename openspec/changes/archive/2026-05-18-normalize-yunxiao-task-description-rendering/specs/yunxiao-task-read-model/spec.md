## MODIFIED Requirements

### Requirement: 云效任务适配层将工作项统一映射为 TaskItem

云效任务适配层 SHALL 在主进程内把云效工作项映射为统一 `TaskItem`，再返回给 renderer。映射结果中 `source` SHALL 为 `yunxiao`，`status` SHALL 为 `open`，`labels` SHALL 严格包含三项：项目名称 `space.name`、类型固定枚举 `需求/任务/缺陷`、当前状态 `status.displayName`。系统 SHALL 按 workitem 类型为 `sourceMeta.url` 构造稳定详情地址：`Req` → `https://devops.aliyun.com/projex/project/<space.id>/req/<id>`，`Task` → `https://devops.aliyun.com/projex/project/<space.id>/task/<id>`，`Bug` → `https://devops.aliyun.com/projex/project/<space.id>/bug/<id>`。若本地云效类型声明缺少实现所需字段，系统 SHALL 先补齐 domain 类型声明，而 SHALL NOT 把原始云效对象直接透传到 renderer。

云效任务的 `description` SHALL 映射为结构化对象 `{ format, content }`，映射规则如下：

- 当 `formatType === "MARKDOWN"` 时，返回 `{ format: "markdown", content: workitem.description ?? "" }`
- 当 `formatType === "RICHTEXT"` 时，系统 SHALL 解析云效返回的 JSON 字符串，并在 `htmlValue` 为字符串时返回 `{ format: "html", content: htmlValue }`
- 当 `RICHTEXT` 解析失败，或 `htmlValue` 缺失/非法时，系统 SHALL 回退到 `{ format: "plain_text", content: workitem.description ?? "" }`
- 对其他未知格式，系统 SHALL 同样回退到 `{ format: "plain_text", content: workitem.description ?? "" }`

#### Scenario: 映射单条需求类云效工作项

- **WHEN** 适配层拿到一条 `category = "Req"` 的云效工作项
- **THEN** 系统生成一个 `TaskItem`
- **AND** 其 `id` 采用 `yunxiao:<spaceId>:<workitemId>` 命名空间格式
- **AND** 其 `sourceMeta.key` 使用云效 `serialNumber`
- **AND** 其 `sourceMeta.url` 等于 `https://devops.aliyun.com/projex/project/<space.id>/req/<id>`
- **AND** 其 `labels` 依次包含项目名称、类型枚举“需求”、当前状态

#### Scenario: 映射 markdown 描述

- **WHEN** 一条云效工作项返回 `formatType = "MARKDOWN"` 且 `description = "## 标题\n- 列表"`
- **THEN** 适配层返回的 `TaskItem.description` 为 `{ format: "markdown", content: "## 标题\n- 列表" }`

#### Scenario: 映射 richtext 描述

- **WHEN** 一条云效工作项返回 `formatType = "RICHTEXT"` 且其 `description` JSON 中包含 `htmlValue = "<p>富文本描述</p>"`
- **THEN** 适配层返回的 `TaskItem.description` 为 `{ format: "html", content: "<p>富文本描述</p>" }`

#### Scenario: richtext 解析失败时降级为纯文本

- **WHEN** 一条云效工作项返回 `formatType = "RICHTEXT"`，但其 `description` 不是合法 JSON
- **THEN** 适配层仍返回一个 `TaskItem`
- **AND** 其 `description` 为 `{ format: "plain_text", content: 原始 description 字符串或空字符串 }`

### Requirement: 云效详情映射回统一 TaskItem 并原样保留 description

云效任务详情读取成功后，系统 SHALL 将返回的工作项映射回统一 `TaskItem`，而不是把原始 `Workitem` 透传给 renderer。映射结果 SHALL 继续使用任务列表阶段的统一规则：`id` 为 `yunxiao:<spaceId>:<workitemId>`，`projectId` 为当前 FylloCode 项目 ID，`source` 为 `yunxiao`，`status` 为 `open`，`sourceMeta.key` 使用 `serialNumber`，`sourceMeta.issueType` 使用固定中文类型枚举，`labels` 继续按项目名称、类型、状态三项构造。

详情接口返回的 `description` SHALL 同样被映射成结构化对象 `{ format, content }`，并遵循与列表阶段完全一致的 `formatType` 规则。适配层 SHALL 在主进程内完成该映射，而不是把原始 Markdown 字符串、RichText JSON 字符串或 `htmlValue` 语义留给 renderer 推断。

#### Scenario: 详情成功后返回 markdown description

- **WHEN** 云效详情接口返回一条工作项，且其 `formatType = "MARKDOWN"`、`description = "第一行\n第二行"`
- **THEN** 适配层返回的 `TaskItem.description` 等于 `{ format: "markdown", content: "第一行\n第二行" }`
- **AND** 其他映射字段继续遵循任务列表阶段的云效映射规则

#### Scenario: 详情成功后返回 richtext description

- **WHEN** 云效详情接口返回 `formatType = "RICHTEXT"`，且 `description` JSON 中的 `htmlValue = "<table><tr><td>概述</td></tr></table>"`
- **THEN** 适配层返回的 `TaskItem.description` 等于 `{ format: "html", content: "<table><tr><td>概述</td></tr></table>" }`

#### Scenario: formatType 异常时回退为纯文本

- **WHEN** 云效详情接口返回未知 `formatType` 或无效 richtext payload
- **THEN** 适配层仍返回一个 `TaskItem`
- **AND** 其 `description` 为 `{ format: "plain_text", content: 原始 description 字符串或空字符串 }`
