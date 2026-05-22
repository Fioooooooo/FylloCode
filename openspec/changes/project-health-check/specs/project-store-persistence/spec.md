## ADDED Requirements

### Requirement: meta.json 存储 healthScore 字段

`ProjectMeta` 接口 SHALL 新增可选字段 `healthScore?: number`，取值范围 0–100，默认不存在时视为 0。`ProjectInfo` 接口 SHALL 同步新增 `healthScore?: number` 字段。`toProjectInfo` 函数 SHALL 将 `meta.healthScore` 透传到 `ProjectInfo.healthScore`。

#### Scenario: 新建项目 meta.json 不含 healthScore

- **WHEN** 用户创建或打开新项目
- **THEN** `meta.json` 不包含 `healthScore` 字段
- **AND** `ProjectInfo.healthScore` 为 `undefined`

#### Scenario: agent 写入 healthScore 后可读取

- **WHEN** agent 通过 `project:update` 传入 `patch: { healthScore: 75 }`
- **THEN** `meta.json` 包含 `healthScore: 75`
- **AND** `project:getById` 返回的 `ProjectInfo.healthScore === 75`

## MODIFIED Requirements

### Requirement: Project 元数据持久化到文件系统

系统 SHALL 将每个 project 的元数据（id、name、path、createdAt、lastOpenedAt、可选的 healthScore）存储为 `data/projects/{encodedPath}/meta.json`，与 session 数据共用同一子目录结构。

#### Scenario: 创建 project 写入 meta 文件

- **WHEN** 用户创建或打开一个新 project
- **THEN** 系统在 `data/projects/{encodedPath}/meta.json` 写入 project 元数据
- **AND** 文件包含 id、name、path、createdAt、lastOpenedAt 字段
- **AND** healthScore 字段仅在被显式写入后才出现

#### Scenario: 更新 project 元数据（含 healthScore）

- **WHEN** 前端调用 `project:update` 并传入 `patch: { healthScore: 80 }`
- **THEN** 系统读取现有 meta，合并 patch 字段（包含 healthScore），写回文件
- **AND** 返回的 `ProjectInfo.healthScore === 80`
