# guidelines-browser Specification

## Purpose

定义项目准则浏览能力的数据契约和页面行为，使 renderer 可以读取当前项目 `guidelines/**/*.md` 的元数据与正文，并向用户展示可浏览、可检索且具备明确加载/失败/空状态的 guidelines 视图。

## Requirements

### Requirement: Project guidelines browser data

系统 SHALL 为当前项目提供项目准则浏览数据，数据来源为项目根目录下的 `guidelines/**/*.md`。

#### Scenario: Recursively reads guideline markdown files

- **WHEN** renderer 以有效 `projectId` 请求项目准则浏览数据
- **THEN** 系统 SHALL 递归读取该项目 `guidelines/**/*.md` 下的 markdown 文件
- **AND** 每个返回项 SHALL 包含项目相对路径、名称、描述、关键词、最近更新时间和 markdown 正文
- **AND** 返回项 SHALL 按项目相对路径稳定排序

#### Scenario: Reuses guideline frontmatter metadata rules

- **WHEN** guideline markdown 文件包含 frontmatter
- **THEN** 系统 SHALL 使用与系统提醒 guidelines index 相同的 frontmatter 解析规则提取 `name`、`description` 和 `keywords`
- **AND** 当 frontmatter 无效时，该 guideline SHALL 仍出现在返回列表中并携带 parse error 信息

#### Scenario: Markdown content excludes frontmatter

- **WHEN** guideline markdown 文件包含 YAML frontmatter
- **THEN** 系统 SHALL 在结构化字段中返回 frontmatter 元数据
- **AND** 返回的 markdown 正文 SHALL NOT 包含该 YAML frontmatter 块

#### Scenario: Missing guidelines directory returns empty data

- **WHEN** 当前项目不存在 `guidelines/` 目录
- **THEN** 系统 SHALL 返回空的项目准则列表
- **AND** 系统 SHALL NOT 将目录缺失作为加载错误

### Requirement: Guidelines page presents list and detail reader

系统 SHALL 提供 `/guidelines` 页面，用于只读浏览当前项目的项目准则。

#### Scenario: Guidelines page loads current project guidelines

- **WHEN** 用户打开 `/guidelines` 且当前项目存在
- **THEN** 页面 SHALL 请求当前项目的项目准则浏览数据
- **AND** 页面 SHALL 展示项目准则列表和选中准则详情

#### Scenario: First guideline is selected by default

- **WHEN** 项目准则浏览数据加载成功且列表非空
- **THEN** 页面 SHALL 默认选中排序后的第一条 guideline
- **AND** 详情区 SHALL 展示该 guideline 的名称、描述、关键词、路径、最近更新时间和 markdown 正文

#### Scenario: User switches selected guideline

- **WHEN** 用户点击项目准则列表中的另一条 guideline
- **THEN** 页面 SHALL 将该 guideline 标记为当前选中项
- **AND** 详情区 SHALL 更新为该 guideline 的元数据和正文

#### Scenario: Guidelines page remains read-only

- **WHEN** 用户浏览 `/guidelines`
- **THEN** 页面 SHALL NOT 展示创建、编辑、删除、重命名或维护 guideline 的操作入口

### Requirement: Guidelines page handles loading failure and empty states

系统 SHALL 为 `/guidelines` 页面提供明确的加载、错误和空状态。

#### Scenario: Loading state appears before guidelines resolve

- **WHEN** 当前项目存在且项目准则浏览数据尚未返回
- **THEN** 页面 SHALL 展示项目准则加载状态
- **AND** 页面 SHALL NOT 展示过期项目的准则数据作为当前项目结果

#### Scenario: Error state appears when browser data fails to load

- **WHEN** 项目准则浏览数据请求失败
- **THEN** 页面 SHALL 展示错误状态和错误信息
- **AND** 页面 SHALL NOT 展示空状态作为失败结果

#### Scenario: Empty state appears when no guidelines exist

- **WHEN** 项目准则浏览数据加载成功但列表为空
- **THEN** 页面 SHALL 展示项目准则空状态
- **AND** 空状态 SHALL 说明当前项目没有可读取的 `guidelines/**/*.md`
