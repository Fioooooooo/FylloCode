# ACP Agent 分类

FylloCode 会为 ACP registry 中的 agent 注入 `__fyllo.kind`，用于帮助用户理解它和本地 CLI、官方产品或桥接工具之间的关系。

当前分类只有三类：

| kind | 定义 |
| --- | --- |
| `native` | 原生 ACP agent，自带完整实现，无外部命令行工具依赖 |
| `adapter` | 独立适配层，自带完整实现，可与对应原生 CLI 共享配置或环境变量，但运行时不调用本地 CLI |
| `bridge` | 桥接层，运行时通过 `spawn` 等方式调用本地命令行工具完成工作 |

## native

`native` 表示这个 ACP agent 自身就是完整实现。它不依赖用户本地已经安装某个官方 CLI，也不会在运行时调用该 CLI。

示例：

- `glm-acp-agent`
- `agoragentic-acp`

## adapter

`adapter` 表示用户视角下存在一个明确的官方 Agent 或 CLI 心智锚点，但这个 ACP 包本身是独立实现，不通过本地 CLI 子进程完成工作。

当前已知 adapter：

- `claude-acp`
- `codex-acp`
- `amp-acp`

判断重点是用户预期：如果用户会自然地问“我装了 Claude Code / Codex CLI / Amp CLI，FylloCode 是不是应该识别它”，并且该 ACP 包不运行时调用本地 CLI，就归为 `adapter`。

## bridge

`bridge` 表示 ACP agent 只是桥接层，实际工作依赖本地命令行工具。

当前已知 bridge：

- `pi-acp`

## 维护规则

新增或重新分类 ACP agent 时，需要同步更新：

- `guidelines/Domain.md`
- `src/main/domain/acp/agent-kind-map.ts`

如果没有明确映射，FylloCode 默认把 agent 解析为 `native`。
