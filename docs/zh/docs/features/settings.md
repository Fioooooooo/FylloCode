---
sidebar:
  group: 产品功能
  order: 90
---

# 设置

设置区域集中管理 FylloCode 的应用级偏好、ACP Agents、全局服务连接和版本信息。ActivityBar 的设置入口保持为 `/settings`，打开后会进入默认的 `/settings/preferences` 页面。

## 页面与路径

设置左侧导航使用固定顺序，并在共享布局中切换四个独立页面：

| 页面 | 路径 | 用途 |
| --- | --- | --- |
| 偏好设置 | `/settings/preferences` | 设置主题、语言、Agent 默认模式、会话自动保存、通知方式和 token 统计选项 |
| Agents | `/settings/acp-agents` | 搜索、安装、更新、识别并配置 ACP Agents |
| 服务连接 | `/settings/connections` | 管理全局 provider 凭证与连接状态 |
| 关于我们 | `/settings/about` | 查看应用版本和更新检查结果 |

在任一 `/settings/*` 子页面中，ActivityBar 的设置项都会保持激活。子页面不会新增一级导航入口。

## 服务连接定向入口

服务连接页面支持 `focus` 查询参数。项目集成需要配置某个 provider 时，会打开 `/settings/connections?focus=<providerId>`；provider 数据加载和连接探测完成后，页面会滚动并聚焦对应卡片。不带 `focus` 时展示完整连接列表。

服务连接只调整用户可见术语和导航路径。内部 `Provider`、`ProviderConnection`、store 与 API 契约保持不变。更多项目级工具配置见[研发系统集成](/docs/features/integrations)。

## 路径兼容性

`/settings?tab=integration-providers`、`/settings?tab=preferences` 和 `/settings?tab=about` 不再用于选择设置区域，也不会兼容重定向到对应子页面。打开带旧 `tab` 参数的 `/settings` 会按默认行为进入 `/settings/preferences`。

需要直接进入某个设置区域时，请使用上表中的独立子路由。
