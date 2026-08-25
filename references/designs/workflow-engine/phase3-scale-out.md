# Workflow Engine Phase 3 — 抽象收敛 + Provider 扩展 + 可视化

状态：draft（仅记录初始设想，未展开详细设计）
日期：2026-08-25

本文档只记录 Phase 3 的范围设想，供后续独立会话展开详细设计时作为起点。详细设计尚未讨论，不要把本文档当作已拍板的方案。

---

## 1. 定位

承接 Phase 1（运行时地基）与 [phase2-agent-generation.md](phase2-agent-generation.md)（生成与沉淀）。Phase 3 解决规模化后才会暴露的两类问题：写入类 op 的扩展性瓶颈，以及复杂 workflow 人眼难以分析的问题。

## 2. 产品背景：任务展示（广）与 workflow 写回（深）的分工

FylloCode 面向企业推广的核心命题：Coding Agent 进入企业后，耗时大头不再是编码，而是操作项目管理平台、与人沟通。产品消解两头摩擦：

- **进入摩擦**：`/task` 页面的任务只读集成（已接云效），让 agent 不离开 FylloCode 就能获得任务上下文。价值标准是"广不深"——不要求覆盖平台全部字段状态，够触发工作即可，可以轻量接多个平台。
- **退出摩擦**：workflow engine 的写回能力（状态流转、评论、通知、开 PR）。价值标准是"深不广"——写动作涉及幂等、副作用确认、gate 判定，必须先在少数高频动作上做扎实。

两条线共享同一个 Provider 抽象，是同一条价值链的入口与出口。现状（2026-08-25 调研）：`/task` 页面的云效只读链路已扎实，但写回路径（`createWorkitem`/`updateWorkitem`/`createChangeRequest`）代码已写但零调用方，是 Phase 3 provider 扩展要接上的第一个真实缺口。

## 3. 初始设想（未展开）

### 3.1 YAML / op 结构进一步抽象

[definition-schema.md](definition-schema.md) 当前的 `ActionOp` 是逐个动作枚举的判别联合（`tracker.transition`、`scm.open-pr` 等）。设想收敛为有限的"能力形状"而非无限增长的具体动作变体：

```ts
type ActionOp =
  | { type: "write.field"; target: TrackerRef; field: string; value: string }
  | { type: "write.comment"; target: TrackerRef; body: string }
  | { type: "write.relation"; target: TrackerRef; relation: string; ref: string }
  | { type: "notify"; channel: string; recipient: string; body: string }
  | { type: "scm.open-pr"; title: string; body?: string; base: string }
  | { type: "exec"; command: string; cwd?: string }
  | { type: "webhook"; url: string; method?: "POST" | "PUT"; body: string };
```

`write.field` 统一原来的 `tracker.transition`（`field: "status"`）和潜在的"指派"（`field: "assignee"`）；`write.relation` 覆盖关联工作项/PR 这类关系型写入；`notify` 是通用通知形状。新增具体动作（指派、加标签……）不需要改 schema，只是 provider 能力表里多声明一个字段。

### 3.2 Provider 能力声明模型

"op 的形状"结构化保留在 schema 里，"具体 provider 支持哪些字段/关系/渠道"由 provider 注册表声明：

```ts
interface ProviderCapabilities {
  id: "yunxiao" | "jira" | "tapd" | string;
  writableFields: string[]; // 如 ["status", "assignee"]
  relations: string[]; // 如 ["blocks", "duplicates"]
  notifyChannels: string[]; // 如 ["comment", "im"]
}
```

解析期校验 workflow 引用的字段是否在对应 provider 的能力范围内，不满足直接拒绝启动。

Provider 抽象需要同时服务两个消费者，不能各建一套：

```
ProviderAdapter (per platform: 云效/Jira/TAPD)
├── read: listWorkitems / getWorkitem      ──> /task 页面展示
└── write: transitionWorkitem / comment /  ──> workflow ActionStage op
          createMR
```

云效现有的 `src/main/infra/integration/yunxiao/projex/`（`searchWorkitems`/`getWorkitem` 供 `/task` 用，`createWorkitem`/`updateWorkitem` 已写但零调用方）是这个合并后 Provider 的云效实现的一半，缺的是把写接口接到 `write.field` op 上。

CLI 逃生舱（`exec`/`webhook`）作为长尾企业私有系统的兜底路径保留，不为它单独做结构化抽象；可考虑"命令模板注册表"机制，让 agent 只能引用团队预先登记好的命令，不能即兴生成危险命令——这个和安全边界（Phase 2 也会提前遇到，见 [phase2-agent-generation.md](phase2-agent-generation.md) 第 3 节）相关。

### 3.3 YAML 图形化展示

复杂 workflow（多分支、多回边、`maxLoops` 循环）单靠人眼读 YAML 已经不好分析复杂度。设想提供节点/连线/环路的可视化展示，帮用户梳理流程结构，尤其是审阅 Phase 2 agent 生成的 workflow 时。

## 4. `/task` 页面与 workflow engine 的收敛关系

决定"接入 Jira/TAPD 等更多任务管理平台是否值得"的，不是"用户想不想看到该平台的任务"，而是"进入（读）+ 退出（写）这一整条链路在一个平台（云效）上跑通后，复用到第二个平台的边际成本有多低"。如果 Provider 抽象合并得好，第二个平台的成本应显著低于第一个（不用重新设计交互，只需重新实现 adapter）——这是 Phase 3 判断是否该扩展更多平台的核心标准。

## 5. 待后续会话展开的问题（先列不深入）

- `write.field`/`write.relation`/`notify` 的具体字段集合和校验规则。
- `/task` 页面现有 `TaskAdapter` 接口（只有 `list`/`get`）与 workflow 的 `ActionOp` provider 抽象如何合并，是否需要重构 `TaskAdapter` 增加 `update` 方法。
- 图形化展示的技术选型（现有渲染栈内是否有可复用的图可视化组件）、交互设计（只读查看还是可以在图上编辑）。
- Provider 能力声明的解析期校验具体接入 [definition-schema.md](definition-schema.md) 第 9 节的哪个校验阶段。
- 云效凭证明文存储（`data/integrations/credentials/yunxiao.json`，无加密）的技术债是否要在此阶段一并处理。
