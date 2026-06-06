# yunxiao-task-read-model Specification

## Purpose

TBD - created by archiving change integrate-yunxiao-task-board. Update Purpose after archive.

## Requirements

### Requirement: 云效任务适配层从项目挂载资源聚合只读任务

系统 SHALL 在主进程 `service/task` 层提供云效任务适配能力，从当前 FylloCode 项目在 `/integration` 的 `project-management` 阶段中已挂载的 `yunxiao / projex-project` 资源读取云效任务。适配层 SHALL NOT 在 `/task` 页面重新要求用户选择云效项目，也 SHALL NOT 引入独立于项目集成配置之外的云效任务来源配置。

#### Scenario: 当前项目挂载多个云效 Projex 项目

- **WHEN** 当前项目的 `project-management` 阶段已挂载多个 `{ providerId: "yunxiao", resourceType: "projex-project" }` 资源
- **THEN** 适配层从这些挂载项的 `resourceId` 中逐一读取 `spaceId`
- **AND** 对每个 `spaceId` 继续执行云效工作项查询

### Requirement: 云效任务适配层按固定参数查询分配给我的未关闭工作项

云效任务适配层 SHALL 分别对 `Req`、`Task`、`Bug` 三类工作项发起查询，并使用固定搜索参数表达“当前登录云效用户分配给我的未关闭工作项”。实现 SHALL 使用已持久化的云效 `userId` 组装 `assignedTo` 过滤条件，并 SHALL 以固定 `page=1`、`perPage=20`、`orderBy=gmtCreate`、`sort=desc` 查询每个“项目 × 类型”的结果。适配层 SHALL NOT 在 FylloCode 内再次通过 `logicalStatus`、`statusStageId` 或状态名重算“未关闭”。

#### Scenario: 查询需求、任务、缺陷三类工作项

- **WHEN** 适配层开始拉取某个云效 Projex 项目的任务
- **THEN** 系统分别以固定条件查询 `Req`、`Task`、`Bug`
- **AND** 每类请求都包含该项目的 `spaceId`
- **AND** 每类请求都包含 `assignedTo` 为当前云效用户 ID 的过滤条件
- **AND** 每类请求都最多拉取 20 条结果

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

### Requirement: 云效任务聚合采用部分成功优先并静默忽略失败

云效任务适配层 SHALL 允许多个挂载项目中的部分查询失败。对于失败的项目或失败的工作项类型，系统 SHALL 仅记录主进程日志，SHALL NOT 向用户展示错误提示，也 SHALL NOT 因局部失败而丢弃其他项目的成功结果。聚合完成后，系统 SHALL 按 `updatedAt` 倒序返回成功映射出的任务集合。

#### Scenario: 三个挂载项目中一个项目查询失败

- **WHEN** 当前项目挂载了三个云效 Projex 项目，且其中一个项目的任意查询失败
- **THEN** 系统继续返回其余项目中成功拉取并映射出的任务
- **AND** `/task` 页面不展示“部分项目加载失败”提示
- **AND** 失败信息仅保留在主进程日志中

### Requirement: 云效任务适配层支持按单条工作项按需读取详情

系统 SHALL 在主进程 `src/main/services/task/adapters/yunxiao-task-adapter.ts` 中提供单条云效任务详情读取能力，用于任务详情弹窗在打开时按需获取完整描述。该能力 SHALL 接收任务命名空间 ID `yunxiao:<spaceId>:<workitemId>` 与当前 FylloCode `projectId`，并 SHALL 调用云效 `getworkitem` 接口读取工作项详情，而 SHALL NOT 通过重新执行 `list(projectId)` 后在结果中全量扫描来补详情。

#### Scenario: 通过命名空间任务 ID 读取详情

- **WHEN** 系统收到 `taskId = "yunxiao:space-1:workitem-102"` 且 `projectId = "project-1"` 的详情读取请求
- **THEN** 适配层解析出 `spaceId = "space-1"` 与 `workitemId = "workitem-102"`
- **AND** 适配层调用云效 `getworkitem` 接口读取该工作项详情

#### Scenario: 非法命名空间任务 ID 不走全量扫描

- **WHEN** 系统收到不符合 `yunxiao:<spaceId>:<workitemId>` 格式的 taskId
- **THEN** 适配层不调用 `list(projectId)` 做全量扫描补救
- **AND** 适配层返回空结果或 task-not-found 语义，由上层按 task 详情读取失败处理

### Requirement: 云效详情读取使用固定 getworkitem API 与已持久化组织信息

系统 SHALL 在 `src/main/domain/integration/yunxiao/projex/index.ts` 中新增 `getWorkitem` 方法，使用固定请求语义 `GET /oapi/v1/projex/organizations/{organizationId}/workitems/{id}`。其中 `organizationId` SHALL 通过已持久化的 `getYunxiaoOrganizationId()` 读取，工作项 `id` SHALL 使用从命名空间 taskId 中解析出的 `workitemId`。实现 SHALL 复用现有 `YunxiaoClient` 和 token 获取方式，而 SHALL NOT 在 renderer 传入组织 ID、token 或其他云效鉴权参数。

#### Scenario: 使用已保存 organizationId 调用详情接口

- **WHEN** 适配层开始读取云效任务详情
- **THEN** 系统通过 `getYunxiaoOrganizationId()` 读取 organizationId
- **AND** 系统通过现有云效 client 发起 `GET /oapi/v1/projex/organizations/{organizationId}/workitems/{workitemId}` 请求

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
