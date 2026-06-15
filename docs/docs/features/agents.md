# ACP Agents

FylloCode 通过 Agent Client Protocol 接入不同 Coding Agent。ACP Agents 页面负责展示 registry 中可用的 Agent，并管理安装、更新和本地识别状态。

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

## Agent 类型

FylloCode 会把 ACP Agent 标注为三类：

| 类型 | 含义 |
| --- | --- |
| `native` | 原生 ACP agent，自带完整实现，无外部命令行工具依赖 |
| `adapter` | 独立适配层，自带完整实现，可与对应官方 CLI 共享配置或环境变量 |
| `bridge` | 桥接层，运行时通过本地命令行工具完成工作 |

详细判定标准见 [ACP Agent 分类](/docs/reference/acp-agent-kind)。
