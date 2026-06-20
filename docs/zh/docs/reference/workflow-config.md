---
sidebar:
  group: 参考
  groupOrder: 30
  order: 10
---

# Workflow 配置

Workflow 模板使用 YAML 描述。编辑器以 YAML 为唯一数据源，界面上的阶段预览、追加、删除、排序和 Agent 选择都会回写到 YAML 字符串。

## 基本结构

```yaml
name: 最短实现
description: 只有 apply 阶段，根据 proposal 做变更实现
version: 1
stages:
  - id: stage-proposal-apply
    name: 应用变更
    type: proposal-apply
    agent: codex-acp
    prompt: 按照已确认的 proposal 任务实施代码变更。
    when: proposal 状态为“准备执行”
    onFailure: 停止后续阶段
    mcp: []
    skills: []
```

## 顶层字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | Workflow 名称 |
| `description` | string | Workflow 描述 |
| `version` | number | 模板版本 |
| `stages` | array | 阶段列表 |

## Stage 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 否 | 阶段唯一标识。缺省时按顺序生成 `stage-1` 一类 id |
| `name` | string | 否 | 阶段展示名称。缺省时使用 `id` |
| `type` | string | 否 | 阶段类型。未知类型会按 `custom` 处理 |
| `agent` | string | 否 | 该阶段使用的 ACP Agent id |
| `prompt` | string | 否 | 阶段执行说明 |
| `when` | string | 否 | 触发条件说明 |
| `onFailure` | string | 否 | 失败后的处理说明 |
| `mcp` | string[] | 否 | 阶段需要的 MCP 能力 |
| `skills` | string[] | 否 | 阶段需要的 skill |

## Stage 类型

| 类型 | 说明 |
| --- | --- |
| `proposal-apply` | 按已确认的 proposal tasks 实施代码变更 |
| `proposal-archive` | 整理执行结果并完成 proposal 归档 |
| `code-review` | 审查当前变更的正确性、可维护性和测试覆盖 |
| `security-check` | 检查依赖、权限、密钥和潜在安全风险 |
| `create-pr` | 整理变更摘要、测试结果和风险说明并创建 PR |
| `custom` | 自定义阶段 |

兼容处理：旧值 `apply` 会解析为 `proposal-apply`，旧值 `archive` 会解析为 `proposal-archive`。

## 保存规则

- 自定义模板可以直接保存 YAML
- 内置模板保存时会创建自定义副本
- YAML 语法非法时会阻止保存并提示解析错误
- 内置模板不显示删除入口
- 自定义模板可以从详情页或侧边栏删除
