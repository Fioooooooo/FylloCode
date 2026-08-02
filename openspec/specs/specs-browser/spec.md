# specs-browser Specification

## Purpose

定义 Specs browser 如何遍历 Workspace 的全部 Folder repository，以完整 `SpecRef` 隔离跨 Folder 同名 spec，并在列表、详情与筛选流程中保留每个 Folder 的空、缺失、错误和部分成功状态。

## Requirements

### Requirement: Specs browser aggregates every Workspace Folder

系统 SHALL 从当前 Workspace 的每个 Folder repository 读取 `openspec/specs/<specId>/spec.md`，并通过 repository aggregate envelope 返回 Folder 状态与可读 specs。每个 spec SHALL 携带 `SpecRef { folderId, specId }`、owner Folder metadata、repository 相对 source path、Purpose、更新时间以及完整 requirement/scenario projection。

#### Scenario: Two Folders contain the same spec ID

- **WHEN** Folder A 与 Folder B 都包含 `openspec/specs/auth/spec.md`
- **THEN** browser SHALL 返回两个 `auth` item
- **AND** 两个 item SHALL 具有不同 `SpecRef` 和 owner metadata
- **AND** SHALL NOT 按 `specId` 去重

#### Scenario: Missing specs directory is ready empty

- **WHEN** 一个可用 Folder 不存在 `openspec/specs/` 目录
- **THEN** 该 Folder SHALL 返回 `ready` 且 specs items 为空
- **AND** SHALL NOT 把目录缺失当作 repository error

#### Scenario: Invalid spec is isolated

- **WHEN** 一个 spec markdown 无法读取或解析，但同 Folder 其他 specs 有效
- **THEN** 有效 specs SHALL 保留
- **AND** 无效 spec SHALL 产生包含 `folderId` 与 source path 的 item warning

### Requirement: Specs page uses SpecRef for list and detail

`/specs` 页面 SHALL 使用完整 `SpecRef` 作为 Vue key、selected state 和 detail lookup，并展示 owner Folder badge、Folder filter 与 Folder-level ready-empty/missing/error 状态。页面 SHALL 保持只读，不提供 spec mutation 操作。

#### Scenario: User opens same-name spec from secondary Folder

- **WHEN** 用户点击 secondary Folder 中与 primary 同名的 spec
- **THEN** 页面 SHALL 以 secondary Folder 的 `SpecRef` 标记选中项
- **AND** detail SHALL 展示该 Folder 的 Purpose、source path 与 requirements
- **AND** SHALL NOT 复用 primary Folder 同名 spec 的缓存或详情

#### Scenario: Partial result remains browseable

- **WHEN** aggregate 中至少一个 Folder ready 且至少一个 Folder missing 或 error
- **THEN** 页面 SHALL 保留 ready specs 的列表与详情
- **AND** SHALL 显示 partial 状态和未计入 Folder
- **AND** SHALL NOT 用页面级失败替代可用数据

#### Scenario: Filtered Folder is empty

- **WHEN** 用户选择一个状态为 ready 但 specs items 为空的 Folder
- **THEN** 页面 SHALL 展示该 Folder 的过滤空态
- **AND** 空态 SHALL 与 missing/error 状态使用不同文案

#### Scenario: Workspace switch clears SpecRef selection

- **WHEN** 当前 Workspace 发生变化
- **THEN** Specs store SHALL 清除旧 `SpecRef` selection 和 filter
- **AND** 前一 Workspace 的迟到 response SHALL NOT 恢复旧详情
