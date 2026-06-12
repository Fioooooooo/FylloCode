## MODIFIED Requirements

### Requirement: Proposal detail page has independent route

系统 SHALL 为 proposal 详情提供独立路由 `/proposal/:id`，其中 id 为 change 目录名。

详情页返回按钮 SHALL 回退到导航来路（`router.back()`）；当不存在可回退的历史记录时（如用户深链直达 `/proposal/:id` 或刷新后首屏即详情页），SHALL 兜底跳转到 `/overview`。返回按钮 SHALL NOT 再固定跳转 `/proposal` 列表页。

#### Scenario: Navigate to detail

- **WHEN** 用户点击列表中的 proposal 卡片
- **THEN** 路由跳转至 `/proposal/:id`
- **AND** 页面展示该 proposal 的详情

#### Scenario: Back navigation 存在来路

- **WHEN** 用户从某来路页面（如 `/overview` 或 `/proposal` 列表页）进入详情页后点击返回按钮
- **THEN** 路由回退到该来路页面（`router.back()`）

#### Scenario: Back navigation 无来路兜底

- **WHEN** 用户直接通过 URL 打开 `/proposal/:id`（无可回退历史）后点击返回按钮
- **THEN** 路由跳转至 `/overview`
