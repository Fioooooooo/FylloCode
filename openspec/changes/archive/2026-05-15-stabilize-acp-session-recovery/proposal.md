## Why

FylloCode 当前将持久化的 `acpSessionId` 视为“目标 ACP agent 进程里仍然持有该 session”的充分证据。这个假设在应用重启或 agent 进程重启后会失效，导致用户在历史会话里发送首条新消息时直接触发 agent 侧的 “session not found” 类错误，而现有恢复行为也没有被清晰定义。

ACP 仍处于早期阶段，不同 adapter 暴露的恢复能力并不一致：有的支持 `resumeSession`，有的只支持 `loadSession`，缺失 session 的错误形态也不统一。FylloCode 需要一套更明确、由 capability 驱动的恢复契约，在兼容多种 adapter 差异的同时，不为了某一个 agent 的当前实现过度定制。

## What Changes

- 将 ACP session 启动行为从“只要存在持久化 `acpSessionId` 就默认 resume 优先”改为“先尝试 direct `prompt`，仅在命中已分类的 session-missing 错误时才进入恢复流”。
- 增加一条由 agent capability 决定的恢复链路，根据支持情况选择 `resumeSession`、`loadSession` 或 `newSession`，不再写死单一路径。
- 在 FylloCode 侧定义稳定的 “session missing” 错误分类规则，使恢复逻辑不依赖某一个 adapter 的具体报错实现。
- 定义 `loadSession` 的 replay 抑制规则：当 FylloCode 本地已经存在该会话的历史消息时，agent 回放的历史 `session/update` 不得重复进入 UI 或再次写盘。
- 定义最终兜底路径：当 ACP 原生恢复能力全部失败时，创建新的 ACP session，并基于 FylloCode 本地持久化消息构造一条额外的 `system-reminder` 历史转录，作为 best-effort 上下文重建输入。
- 保持实现务实清晰：将恢复判定和 replay 处理封装在聚焦的单元内，但不为了未来可能出现的 ACP 变化预建一套过度抽象的框架。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `acp-chat-backend`：将 ACP session 生命周期约束从“持久化 session 默认 resume 优先”调整为“capability-driven recovery”，并补充 session-missing 错误分类、`loadSession` replay 抑制、以及本地历史 best-effort 重建兜底。

## Impact

- 影响的主进程代码包括：`electron/main/services/chat/acp-session.ts`、`electron/main/infra/process/acp-process-pool.ts`、chat / proposal apply 相关 IPC handler，以及关联的 session event 分发逻辑。
- 影响所有复用 `AcpSession` 的持久化 session 场景，包括 chat、proposal apply stage、archive，以及这些场景下 `system-reminder` 的持久化与展示边界。
- 不引入新的外部依赖，但 FylloCode 会更明确地依赖 ACP `initialize` 能力协商结果，以及 adapter 差异化失败信号的本地归类。
