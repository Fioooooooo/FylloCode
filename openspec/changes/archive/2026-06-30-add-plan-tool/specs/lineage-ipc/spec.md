## ADDED Requirements

### Requirement: lineage 暴露 plan 读写与批准 channel

系统 SHALL 在 lineage 专属 channel 常量中新增以下 IPC channel，并按现有 lineage IPC 模式在 `src/main/ipc/lineage.ts` 注册 handler、在 `src/preload/api/lineage.ts` 与 `src/renderer/src/api/lineage.ts` 暴露请求-响应 api：

- `lineage:readPlan`
- `lineage:savePlanBody`
- `lineage:approvePlan`

所有 handler SHALL 复用 `ipc/_kit` 的 `wrapHandler` 与 `validate`。入参 SHALL 由 `src/shared/schemas/ipc/lineage.ts` 的 zod schema 校验。每个入参 SHALL 包含 `projectId: string`、`sessionId: string`、`slug: string`；`projectId`、`sessionId`、`slug` 均 SHALL 为非空字符串。

`slug` SHALL 匹配完整 plan slug 格式：`yyyy-MM-dd-<agent-slug>`，并 SHALL NOT 包含路径分隔符、`.`、`..` 或空白。主进程 SHALL 根据 `projectId -> projectPath`、`sessionId` 与 `slug` 推导 plan 文件路径，并将访问限制在 `sessions/<sessionId>/plans/` 目录内。

#### Scenario: readPlan 经 IPC 读取 plan

- **WHEN** renderer 调用 `lineageApi.readPlan(projectId, { sessionId: "sess-1", slug: "2026-06-29-plan-a" })`
- **THEN** 主进程 handler 校验入参后解析 projectPath
- **AND** 读取 `sessions/sess-1/plans/2026-06-29-plan-a.md`
- **AND** 返回解析后的 plan document

#### Scenario: 非法 slug 被 schema 拒绝

- **WHEN** renderer 以 `slug = "../secret"` 调用任一 plan IPC
- **THEN** handler 通过 `validate` 抛出校验错误，返回标准 IPC 错误响应
- **AND** 不读取或写入任何文件

### Requirement: readPlan 返回 plan document

`lineage:readPlan` SHALL 返回 `PlanDocument`：

```ts
type PlanDocument = {
  slug: string;
  goal: string;
  createdAt: string;
  status: "draft" | "approved";
  body: string;
};
```

`body` SHALL 为去除 frontmatter 后的 markdown 正文。若文件不存在、frontmatter 缺失必要字段、status 不是 `"draft"` 或 `"approved"`，handler SHALL 返回标准 IPC 错误响应。

#### Scenario: readPlan 拆分 frontmatter 与正文

- **WHEN** plan 文件包含合法 frontmatter 与 markdown 正文
- **THEN** `lineage:readPlan` 返回 frontmatter 字段
- **AND** `body` 只包含 markdown 正文，不包含 frontmatter 分隔线

#### Scenario: plan 文件不存在

- **WHEN** renderer 调用 `readPlan` 指向不存在的 slug
- **THEN** handler 返回标准 IPC 错误响应
- **AND** 不创建空 plan 文件

### Requirement: savePlanBody 只保存正文并保留 frontmatter

`lineage:savePlanBody` SHALL 接收 `{ projectId, sessionId, slug, body }`，其中 `body` 为 markdown 字符串。handler SHALL 读取现有 plan 文件，保留 frontmatter 中的 `slug`、`goal`、`createdAt`、`status`，只替换正文内容并写回同一文件。

`savePlanBody` SHALL NOT 允许 renderer 修改 frontmatter。若现有文件不是合法 plan document，handler SHALL 返回错误，避免覆盖损坏文件。

#### Scenario: 保存正文保留 approved 状态

- **WHEN** plan frontmatter 中 `status === "approved"`
- **AND** renderer 调用 `savePlanBody` 更新正文
- **THEN** 写回后的 frontmatter 仍为 `status: approved`
- **AND** 只有正文被替换

#### Scenario: 损坏 frontmatter 时拒绝保存

- **WHEN** plan 文件缺失合法 frontmatter
- **AND** renderer 调用 `savePlanBody`
- **THEN** handler 返回标准 IPC 错误响应
- **AND** 不覆盖原文件内容

### Requirement: approvePlan 幂等批准 plan

`lineage:approvePlan` SHALL 接收 `{ projectId, sessionId, slug }`。handler SHALL 读取现有 plan 文件，将 frontmatter `status` 更新为 `"approved"` 并保留其他 frontmatter 字段与正文。若 plan 已经是 `"approved"`，handler SHALL 保持幂等并返回当前 `PlanDocument`。

#### Scenario: draft plan 被批准

- **WHEN** plan frontmatter 中 `status === "draft"`
- **AND** renderer 调用 `approvePlan`
- **THEN** 写回后的 frontmatter 中 `status === "approved"`
- **AND** 返回的 `PlanDocument.status === "approved"`

#### Scenario: approved plan 重复批准

- **WHEN** plan frontmatter 中 `status === "approved"`
- **AND** renderer 再次调用 `approvePlan`
- **THEN** handler 不报错
- **AND** 返回的 `PlanDocument.status === "approved"`
