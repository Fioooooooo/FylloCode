## MODIFIED Requirements

### Requirement: 任务卡展示关联会话入口

系统 SHALL 在任务看板中为存在 lineage 会话链接的任务展示关联会话入口；lineage subject 与 session list SHALL 由当前 `workspaceId` 定位。

#### Scenario: 任务存在关联会话

- **WHEN** 用户打开任务看板，且某个可见任务的 `lineageApi.getByTask(workspaceId, ref)` 返回至少一个 `LineageSessionLink`
- **THEN** 该任务卡 SHALL 展示关联会话入口，并显示关联会话数量

#### Scenario: 任务没有关联会话

- **WHEN** 用户打开任务看板，且某个可见任务没有 lineage subject、查询结果为 `null`，或查询结果的 `links` 为空
- **THEN** 该任务卡 SHALL 不展示关联会话入口

#### Scenario: 关联会话加载失败

- **WHEN** 某个任务的关联会话查询失败
- **THEN** 系统 SHALL 保持任务列表可用，并 SHALL NOT 用该失败替换任务列表的主错误状态

#### Scenario: 不同 Workspace 的同名任务保持隔离

- **WHEN** Workspace A 与 Workspace B 都存在相同 task ref
- **THEN** `getByTask(workspaceId, ref)` SHALL 只返回指定 Workspace 的 lineage links
- **AND** 另一 Workspace 的会话 SHALL NOT 出现在当前任务卡
