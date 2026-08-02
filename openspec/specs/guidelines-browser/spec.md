# guidelines-browser Specification

## Purpose

定义项目准则浏览能力的数据契约和页面行为，使 renderer 可以读取当前项目 `guidelines/**/*.md` 的元数据与正文，并向用户展示可浏览、可检索且具备明确加载/失败/空状态的 guidelines 视图。

## Requirements

### Requirement: Project guidelines browser data

系统 SHALL 为当前 Workspace 提供按 Folder 聚合的准则浏览数据。数据来源 SHALL 是该 Workspace 每个成员 Folder repository 根目录下的 `guidelines/**/*.md`；每个 item SHALL 携带 `GuidelineRef { folderId, path }` 和 owner Folder metadata，aggregate SHALL 保留 ready-empty、missing、error 与 item warning。

#### Scenario: Recursively reads guideline markdown files

- **WHEN** renderer 以有效 `workspaceId` 请求准则浏览数据
- **THEN** 系统 SHALL 通过 Workspace resolver 取得完整 Folder 集合
- **AND** 系统 SHALL 对每个可用 Folder 递归读取 `guidelines/**/*.md`
- **AND** 每个返回项 SHALL 包含 GuidelineRef、owner metadata、repository 相对路径、名称、描述、关键词、最近更新时间和 markdown 正文
- **AND** Folder results SHALL 按 Workspace member 顺序稳定排列，每个 Folder 内按 repository 相对路径稳定排序

#### Scenario: Reuses guideline frontmatter metadata rules

- **WHEN** guideline markdown 文件包含 frontmatter
- **THEN** 系统 SHALL 使用与系统提醒 guidelines index 相同的 frontmatter 解析规则提取 `name`、`description` 和 `keywords`
- **AND** 当 frontmatter 无效时，该 guideline SHALL 仍出现在对应 Folder 返回列表中并携带 owner-qualified parse warning

#### Scenario: Markdown content excludes frontmatter

- **WHEN** guideline markdown 文件包含 YAML frontmatter
- **THEN** 系统 SHALL 在结构化字段中返回 frontmatter 元数据
- **AND** 返回的 markdown 正文 SHALL NOT 包含该 YAML frontmatter 块

#### Scenario: Missing guidelines directory returns ready empty data

- **WHEN** 一个可用 Folder repository 不存在 `guidelines/` 目录
- **THEN** 该 Folder result SHALL 为 `ready` 且准则列表为空
- **AND** 系统 SHALL NOT 将目录缺失作为加载错误

#### Scenario: One Folder cannot be read

- **WHEN** 一个 Folder guideline scan 因 permission 或 I/O 失败，而其他 Folder 可读
- **THEN** 失败 Folder SHALL 返回 `error`
- **AND** 其他 Folder 的 guideline items SHALL 保留
- **AND** aggregate SHALL 标记 partial completeness

### Requirement: Guidelines page presents list and detail reader

系统 SHALL 提供 `/guidelines` 页面，用于只读浏览当前 Workspace 全部 Folder 的 repository guidelines。列表 key、selection、detail lookup 与 cache SHALL 使用完整 `GuidelineRef`，页面 SHALL 提供 Folder filter 和 owner badge，filter SHALL NOT 改写 detail owner。

#### Scenario: Guidelines page loads current Workspace guidelines

- **WHEN** 用户打开 `/guidelines` 且当前 Workspace 可解析
- **THEN** 页面 SHALL 请求当前 Workspace 的准则 aggregate
- **AND** 页面 SHALL 展示 Folder 状态、准则列表和选中准则详情

#### Scenario: First guideline is selected by default

- **WHEN** 准则浏览数据加载成功且可见列表非空
- **THEN** 页面 SHALL 默认选中排序后的第一条 GuidelineRef
- **AND** 详情区 SHALL 展示该 guideline 的 owner Folder、名称、描述、关键词、路径、最近更新时间和 markdown 正文

#### Scenario: User switches selected same-path guideline

- **WHEN** 用户点击另一个 Folder 中 path 相同的 guideline
- **THEN** 页面 SHALL 将该 item 的完整 GuidelineRef 标记为当前选中项
- **AND** 详情区 SHALL 更新为该 owner 的元数据和正文
- **AND** SHALL NOT 复用其他 Folder 同 path guideline 的详情

#### Scenario: Guidelines page remains read-only

- **WHEN** 用户浏览 `/guidelines`
- **THEN** 页面 SHALL NOT 展示创建、编辑、删除、重命名或维护 guideline 的操作入口

### Requirement: Guidelines page handles loading failure and empty states

系统 SHALL 为 `/guidelines` 页面提供明确的全局 loading、Folder-level ready-empty/missing/error、partial 和 filtered-empty 状态，并让异步状态始终绑定当前 `workspaceId`。

#### Scenario: Loading state appears before guidelines resolve

- **WHEN** 当前 Workspace 存在且准则浏览数据尚未返回
- **THEN** 页面 SHALL 展示准则加载状态
- **AND** 页面 SHALL NOT 展示过期 Workspace 的准则数据作为当前结果

#### Scenario: Total request failure is page-level

- **WHEN** 当前 Workspace 无法解析或准则 aggregate 请求失败
- **THEN** 页面 SHALL 展示页面级错误状态和错误信息
- **AND** 页面 SHALL NOT 展示全局空状态作为失败结果

#### Scenario: Partial result retains ready guidelines

- **WHEN** 至少一个 Folder ready 且至少一个 Folder missing 或 error
- **THEN** 页面 SHALL 继续展示 ready Folder 的 guidelines
- **AND** SHALL 显示 partial warning 和受影响 Folder

#### Scenario: Empty state appears when all ready Folders are empty

- **WHEN** aggregate 完整加载且所有 Folder 均为 ready 且列表为空
- **THEN** 页面 SHALL 展示 Workspace 准则空状态
- **AND** 空状态 SHALL 说明所有当前 Folder repository 都没有可读取的 `guidelines/**/*.md`
