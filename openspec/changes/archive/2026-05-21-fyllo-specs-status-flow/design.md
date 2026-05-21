## Context

`creating` 是 proposal 创建过程中的中间态，但当前没有稳定的、显式的收口点把它转成 `draft`。由于 proposal 的 artifacts 是由 ACP agent 写入的，而不是由 main process 统一生成，主线程无法可靠判断“创建已完成”的时刻。

## Goals / Non-Goals

**Goals:**

- 明确 `creating -> draft` 的责任边界。
- 让创建完成后的 proposal 进入可实现状态，而不是长期停留在 `creating`。
- 保持 `explore` 无副作用。

**Non-Goals:**

- 不引入后台 watcher 或主线程状态推断。
- 不改变 `draft -> applying`、`applying -> archived` 的流程。
- 不增加新的 proposal status 枚举。

## Decisions

1. 采用 prompt 驱动的显式收口。
   - `create-proposal` 的指令要求 agent 在 required artifacts 完成后把状态写成 `draft`。
   - 这样状态推进与 artifact 产出发生在同一个工作流里，不需要另一个工具回调。
   - Alternatives considered: 在主线程读路径上自动归一化，或者在 tool runtime 里做隐式写回。前者缺少 artifact 完整性视角，后者容易在其他阶段被误触发。

2. `explore` 保持只读。
   - `explore` 只负责观察，不承担生命周期推进。
   - Alternatives considered: 在 `explore` 中顺手把 `creating` 改成 `draft`。这会让只读工具产生副作用，且调用时机不稳定。

3. 不做 runtime 自动修复作为主路径。
   - 主路径要求 agent 显式完成收口，确保行为可见、可解释。
   - 如果后续需要，可再单独增加幂等兜底，但这次不作为 proposal 目标。

## Risks / Trade-offs

- [Risk] Agent 可能忘记最后的 `draft` 写回。 -> [Mitigation] 在 prompt 中把这一步写成硬性收口步骤，并用测试锁定 prompt 文本。
- [Risk] 依赖 prompt 的流程比自动修复更脆弱。 -> [Mitigation] 保持 `explore` 无副作用，避免状态在非创建阶段被误改。
