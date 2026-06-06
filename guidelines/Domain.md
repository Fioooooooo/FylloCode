---
name: Domain
description: FylloCode 的产品词汇、ACP agent 分类判定标准与同步纪律
keywords: [domain, acp, agent-kind]
---

# Domain

## Purpose

定义 FylloCode 的产品词汇、业务规则和判定标准。任何评估“某个 ACP agent 应归为 `native` / `adapter` / `bridge`”的决策，都必须先阅读本文档。

## Applicability

- 适用于 `src/main/domain/acp/agent-kind-map.ts` 中维护的 ACP agent 归类映射。
- 适用于 `src/shared/types/acp-agent.ts` 中的 `AcpAgentKind` 与 `AcpAgentEntry.__fyllo` 命名空间。
- 适用于 `src/main/infra/storage/acp-registry-cache.ts` 对 registry 返回值注入 `__fyllo.kind` 的逻辑。
- 不覆盖 detector 的安装检测实现、安装/卸载流程或 ACP 协议本身的上游 schema。

## Sources of Truth

- `src/main/domain/acp/agent-kind-map.ts`
- `src/shared/types/acp-agent.ts`
- `src/main/infra/storage/acp-registry-cache.ts`

## Rules

- MUST: 将 FylloCode 自有的 ACP agent 分类限制为 `native`、`adapter`、`bridge` 三类，并通过 `AcpAgentEntry.__fyllo.kind` 暴露给消费方。
- MUST: 将 `native` 定义为原生 ACP agent，自带完整实现，无外部命令行工具依赖。
- MUST: 将 `adapter` 定义为独立适配层，自带完整实现，可与对应原生 CLI 共享配置或环境变量，但运行时不调用本地 CLI。
- MUST: 将 `bridge` 定义为桥接层，运行时通过 `spawn` 等方式调用本地命令行工具完成工作。
- MUST: 按“用户心智锚点”判定 `adapter`。当且仅当存在用户视角下的对应官方 Agent 或 CLI，足以让用户产生“我装了它，FylloCode 是不是该识别”的预期，且该 ACP 包自带完整实现、不 `spawn` 该 CLI 子进程时，才归为 `adapter`。
- MUST: 将没有这种心智锚点的纯 HTTP 实现归为 `native`，即使它们同样自带完整实现。
- MUST: 将运行时依赖本地 CLI 的 agent 归为 `bridge`。
- MUST: 新增或重新分类 ACP agent 时，双向同步 `guidelines/Domain.md` 与 `src/main/domain/acp/agent-kind-map.ts`。
- SHOULD: 让 `agent-kind-map.ts` 只显式列出 `adapter` 与 `bridge` 的已知 id，其他 id 通过兜底解析为 `native`。

## Examples

- `adapter`: `claude-acp`（Claude Code）、`codex-acp`（Codex CLI）、`amp-acp`（Amp CLI）
- `bridge`: `pi-acp`（运行时 `spawn` 本地 `pi` CLI）
- `native`: `glm-acp-agent`（GLM 无官方 CLI 产品，纯 HTTP 实现）
- `native`: `agoragentic-acp`（marketplace SaaS，无对应 CLI 产品）

## Verification

- 评估新 agent 时，先对照本文档中的三类定义与“用户心智锚点”判定准则，再决定是否修改 `agent-kind-map.ts`。
- 变更映射或共享类型后，运行 `pnpm typecheck` 和 `pnpm test`，确认 `AcpAgentKind`、registry 注入逻辑和相关主进程测试未被破坏。

## Maintenance

- 当 ACP registry 出现新的 agent 形态时，更新本文档与 `agent-kind-map.ts`。
- 当用户反馈某个 agent 归类有误或提示文案与实际不符时，重新核对本文档判定准则并同步修正实现。
- 当上游 ACP 协议或 FylloCode 产品语义引入新的分类形态时，先更新 OpenSpec，再同步本文档、共享类型和映射实现。
