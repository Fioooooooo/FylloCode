---
sidebar:
  group: 产品功能
  order: 70
---

# ACP Agents

FylloCode 通过 Agent Client Protocol 接入不同 Coding Agent。[设置](/docs/features/settings)中的 ACP Agents 页面位于 `/settings/acp-agents`，负责展示 registry 中可用的 Agent，并管理安装、更新和本地识别状态。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/acp-registry.png" alt="ACP Agents 页面截图" />
</figure>

## 主要能力

- 查看支持 ACP 的 Agent 列表
- 搜索 Agent
- 安装和更新由 FylloCode 管理的 Agent
- 识别用户已经安装的 Agent
- 展示版本、许可证、作者和安装状态
- 按 FylloCode 语义标注 Agent 类型
- 配置不在 registry 中的自定义 Agent

页面提供「全部」「已安装」「自定义」三个筛选：前两者浏览 ACP Registry 中的 Agent，「自定义」是一个独立的 JSON 编辑区域。

## Agent 类型

FylloCode 会把 ACP Agent 标注为三类：

| 类型 | 含义 |
| --- | --- |
| `native` | 原生 ACP agent，自带完整实现，无外部命令行工具依赖 |
| `adapter` | 独立适配层，自带完整实现，可与对应官方 CLI 共享配置或环境变量 |
| `bridge` | 桥接层，运行时通过本地命令行工具完成工作 |

详细判定标准见 [ACP Agent 分类](/docs/reference/acp-agent-kind)。

## 自定义 Agent

如果一个 Coding Agent 支持 ACP 但还没有进入 registry，可以在「自定义」tab 里手动登记，让它和 registry 里的 Agent 一样出现在 Agent 选择器中。

配置以 JSON 形式编辑，结构是一个 `agent_servers` 映射：

```json
{
  "agent_servers": {
    "Kimi Code CLI": {
      "command": "~/.local/bin/kimi",
      "args": ["acp"],
      "env": {}
    }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `command` | Agent 可执行文件路径，支持 `~` 展开和 PATH 查找（必填） |
| `args` | 启动参数数组，例如 `["acp"]`（可选） |
| `env` | 额外环境变量，会合并到系统环境变量之上（可选） |

保存后，配置写入本地的 `custom-agents.json`，不会同步到 registry，也不属于 FylloCode 管理安装/更新的范围——命令本身的安装和升级仍由用户自己维护。

## 连接预热与复用

应用完成主进程启动后，会在后台预热所有已安装的 registry Agent 和有效的自定义 Agent。预热只启动 ACP 进程并完成 `initialize`，不会创建 Chat session，也不会提前取得项目级配置或命令；打开 Launcher 而尚未进入项目时同样会执行。

安装、升级或保存自定义 Agent 后，FylloCode 会增量预热受影响的连接。升级、卸载或修改自定义 Agent 的 `command`、`args`、`env` 前，旧进程会先被主动停止；后续连接使用新的运行时配置。单个 Agent 预热失败不会阻塞窗口启动或其他 Agent，用户实际选择正在预热的 Agent 时会复用同一条在途连接，不会重复启动进程。

Agent 成功初始化后，FylloCode 会缓存认证方式以及 prompt、MCP、session 的完整 capability snapshot。旧版只包含 prompt 能力的缓存仍可读取；Agent 后续成功初始化时会逐步刷新为新格式，不需要手动迁移。

## Session 配置恢复

FylloCode 会把 Agent 最后确认的 model、mode、thought level 和其他 session `configOptions` 随会话元数据保存。应用重启或 Agent 连接重建后，续聊首个 prompt 发送前会先恢复仍受当前 Agent schema 支持的选值；已经删除、type 变化或 value 失效的选项会保留 Agent 当前合法值，同时继续恢复其他兼容项。

如果一个仍兼容的配置无法被 Agent 确认，当前 prompt 会以现有 ACP 错误结束，而不会静默使用默认值。没有持久化配置的旧会话继续沿用原有恢复流程，不需要迁移。
