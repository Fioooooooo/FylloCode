## Context

proposal 详情页当前只能展示 apply 进度；当 apply 的 workflow 已经完成后，用户仍需要一个单独的归档动作。归档必须继续使用已完成的 apply ACP session，而不是重新开启新的 workflow。

## Goals / Non-Goals

**Goals:**

- 在详情页提供明显的归档入口
- 归档动作复用已完成的 apply session
- 归档流沿用现有 stage stream 的消息传输和渲染方式
- 归档完成后让页面能刷新到最新的 archived 状态

**Non-Goals:**

- 改造 workflow 模板本身
- 为归档单独设计新的长期持久化 run 模型
- 改变现有 apply flow 的行为

## Decisions

### 1. 归档作为独立的一阶段流

归档不进入 workflow stages 列表，而是通过独立 IPC 触发一段单阶段流。这样可以保持 workflow 的职责清晰，同时复用现有的 `AcpSession`、MessagePort 和消息组装逻辑。

### 2. 复用已完成 apply stage 的 ACP session id

archive 需要继续 apply 的上下文，因此 main 进程会从当前 apply run 中找到最后一个完成的 stage session id，并用同一个 `fylloSessionId` 恢复会话。

### 3. 用 `proposal-archive` stage type 统一 prompt 构造

归档 prompt 仍然通过 stage runner 策略表构造，只是新增一个 `proposal-archive` 类型。这样可以避免把 prompt 拼接逻辑散落到 IPC handler 里。

### 4. 前端复用现有 proposal run 面板

归档会使用单阶段 pseudo run 驱动现有 SidePanel，这样不需要为归档再做一套渲染器和消息展示组件。

## Risks / Trade-offs

- [风险] 归档与 apply 共享同一个 ACP session，上下文会强耦合。→ 这是需求所要求的行为，风险可接受。
- [风险] 归档 run 不做长期独立持久化，页面刷新后无法恢复正在进行中的归档流。→ 通过将归档视为收尾动作接受该限制，必要时再补持久化。
- [风险] agent 未按 prompt 完成 archive/commit。→ 归档完成后刷新 proposal 元数据，依赖文件系统状态作为最终事实来源。
