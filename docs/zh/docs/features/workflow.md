---
sidebar:
  group: 产品功能
  order: 60
---

# Workflow 编排

Workflow 页面用于把团队自己的执行阶段固化成 YAML 模板。它适合描述 Proposal 之后如何执行、审查、归档或触发后续动作。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/workflow.png" alt="Workflow 编辑器截图" />
</figure>

## 设计原则

Workflow 编辑器以 YAML 为唯一数据源。界面左侧根据 YAML 渲染阶段预览，右侧显示 YAML 源数据。

这种设计有两个好处：

- 团队可以直接审查和版本化流程配置
- UI 操作和源码编辑不会形成两套状态

## 支持的操作

自定义 workflow 支持：

- 新建模板
- 追加 stage
- 删除 stage
- 拖拽排序
- 切换 stage 使用的 Agent
- 直接编辑 YAML
- 保存或删除自定义模板

内置模板默认只读。保存内置模板时，会创建新的自定义副本，原模板保持不变。

## 配置格式

Workflow YAML 的字段和阶段类型见 [Workflow 配置参考](/docs/reference/workflow-config)。
