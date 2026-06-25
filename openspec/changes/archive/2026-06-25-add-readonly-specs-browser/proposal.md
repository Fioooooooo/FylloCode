## Why

项目概览页已经展示「能力规约」数量，但用户无法在应用内查看 `openspec/specs/*/spec.md` 的具体契约内容，统计卡的下钻价值不足。能力规约是归档后稳定下来的行为契约，需要一个只读浏览入口帮助用户快速查看当前项目能力、Requirement 与 Scenario。

## What Changes

- 新增只读能力规约浏览页 `/specs`，从概览页「能力规约」统计卡下钻进入，不加入 ActivityBar 主导航。
- 新增 specs 读取与解析能力：读取 `openspec/specs/<capability>/spec.md`，提取 capability id、Purpose、Requirement、Scenario、源路径、更新时间与统计数量。
- specs 详情页不展示 `#` 一级标题和 `## Purpose` 原文重复内容；顶部展示 id、purpose、source path、更新时间、Requirement/Scenario 统计，下方仅展示 Requirements 及其 Scenarios。
- Requirement / Scenario 结构由解析结果驱动；Requirement 标题和 Scenario 标题用 Vue 文本渲染，Requirement body 和 Scenario body 继续用 `MarkStream` 渲染 markdown。
- Requirement 快速定位目录从解析出的 `requirementGroups` 派生，不作为持久 schema 字段；点击目录项滚动到对应 Requirement。
- 左侧 capability 列表只展示 capability id 和 Purpose 单行摘要；不提供 family/category 分类，不从 spec 里派生不存在的 title 字段。
- 修改概览页「能力规约」卡片为可点击入口，跳转到 `/specs`；「项目准则」「溯源覆盖」仍保持纯展示。

## Capabilities

### New Capabilities

- `specs-browser`: 定义只读能力规约浏览页、spec.md 解析输出、Requirement/Scenario 阅读结构与错误/空态行为。

### Modified Capabilities

- `project-overview`: 将概览页「能力规约」统计卡从纯展示改为 `/specs` 下钻入口，并保留其它非入口卡片的纯展示行为。
- `app-shell-routing`: 将 `/specs` 定义为项目作用域应用路由，受共享应用外壳和当前项目访问约束保护，但不加入 ActivityBar 主导航。

## Impact

- 主进程：新增 specs 读取/解析 service 与 IPC handler，读取 `openspec/specs/*/spec.md` 并返回只读 DTO。
- 共享契约：新增 specs browser DTO、IPC channel 常量与 schema。
- preload：暴露 `specs` API 薄封装。
- renderer：新增 `/specs` 页面、renderer api/store、概览卡入口调整、Requirement/Scenario 结构化展示。
- 测试：新增 main service/IPC 测试、renderer store/page 测试，并更新 overview 页面测试。
