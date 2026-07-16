---
sidebar:
  group: 产品功能
  order: 80
---

# 研发系统集成

FylloCode 的目标不是制造新的任务孤岛，而是把 Agent 工作结果回写到团队已有研发系统中。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/integration-provider.png" alt="服务连接页面截图" />
</figure>

## 服务连接

[设置](/docs/features/settings)中的服务连接页面位于 `/settings/connections`，用于管理全局 provider 凭证和连接状态。当前已实现的连接流程以云效为主；页面中的未开放 provider 只表示预留位置，不代表具体发布时间。

页面会展示：

- provider 连接状态
- 已识别账户
- 凭证回显
- 断开连接入口
- 尚未开放的 provider 占位

## 工具集成

<figure class="fc-doc-image">
  <img src="/assets/screenshots/integration.png" alt="集成工具页面截图" />
</figure>

项目集成页面用于管理项目级工具能力，例如任务读取、结果回写、仓库和流水线关联等。不同 provider 暴露的工具能力可能不同。未连接或连接过期时，页面会打开 `/settings/connections?focus=<providerId>` 定位对应服务连接。

## 当前重点

当前可用能力以页面展示的连接状态和项目工具为准。未开放 provider 的占位不代表已经支持连接、任务同步或结果回写。
