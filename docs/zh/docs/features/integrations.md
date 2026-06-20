---
sidebar:
  group: 产品功能
  order: 80
---

# 研发系统集成

FylloCode 的目标不是制造新的任务孤岛，而是把 Agent 工作结果回写到团队已有研发系统中。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/integration-provider.png" alt="集成提供方页面截图" />
</figure>

## 集成提供方

集成提供方页面用于管理全局 provider 凭证。当前重点是云效，后续会扩展 GitHub、GitLab、Jira、Linear 等系统。

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

集成页面用于管理项目级工具能力，例如任务读取、结果回写、仓库和流水线关联等。不同 provider 暴露的工具能力可能不同。

## 当前重点

第一批集成优先覆盖云效。其他系统处于规划或预留状态，文档和 UI 不应承诺尚未实现的自动化能力。
