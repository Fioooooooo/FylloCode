# Workflow Definition Schema

状态：draft
日期：2026-08-10

本文档只定义 workflow 的**定义态 schema**（用户编写的 YAML）与示例。
运行态持久化、触发器绑定、UI 集成不在本文档范围内。

---

## 1. 控制流模型

Workflow 是一个**带守卫条件的状态机**，不是 DAG。

- 单活动：任意时刻只在一个 stage 上
- 允许回边：`next` 可以指向已访问过的 stage，用 `maxLoops` 约束
- 转移由事件驱动：`pass` / `fail` / `signal`

进度的表示是"当前在哪个 stage + 每个 stage 访问过几次"，不是"已完成节点集合"。

---

## 2. 顶层结构

```yaml
name: string # 必填，展示名
version: 2 # 必填，schema 版本
description: string # 可选
requires: [ContextKind] # 可选，默认 []，启动前置条件
confirmStart: boolean # 可选，默认 false
stages: Stage[] # 必填，至少一个
```

```ts
type WorkflowDefinition = {
  name: string;
  version: 2;
  description?: string;
  requires?: ContextKind[];
  confirmStart?: boolean;
  stages: Stage[];
};
```

### 2.1 `requires`

声明启动这条 workflow 需要什么输入上下文。引擎在启动前校验，不满足则拒绝启动并说明缺什么。

```ts
type ContextKind = "proposal" | "plan" | "task" | "chat";
```

| 值         | 含义                       | 满足时可用的模板变量                |
| ---------- | -------------------------- | ----------------------------------- |
| `proposal` | 存在已批准的 proposal      | `proposal.*`、`tasks.*`             |
| `plan`     | 存在会话级 plan            | `plan.*`                            |
| `task`     | 关联了一个 task            | `task.*`                            |
| `chat`     | 由 chat 发起，有对话上下文 | `chat.*`，且允许 `context: inherit` |

`requires: []` 表示无前置条件，任何触发源都能启动。

### 2.2 `confirmStart`

`true` 时启动前需要用户确认一次；`false` 直接开跑。

按代价决定：起 worktree、有对外副作用、预计时长以小时计的，设 `true`。分钟级的本地改动设 `false`——用户刚表达完执行意图，再确认一次是重复。

---

## 3. Stage

三种 kind，共享 `id` / `name` / `next`，其余字段互不相同。

```ts
type Stage = AgentStage | ActionStage | WaitStage;

type StageBase = {
  id: string; // workflow 内唯一
  name?: string; // 展示名，缺省用 id
  next?: Transition[]; // 缺省时必须显式 terminal: true
  terminal?: boolean; // 默认 false
};
```

`next` 与 `terminal` 必须恰好有一个生效——避免"写漏了 next"和"这是终态"在解析时无法区分。

### 3.1 AgentStage

由 agent 执行，产出结构化产物。

```ts
type AgentStage = StageBase & {
  kind: "agent";
  agent?: string; // ACP agent id，缺省用当前/默认 agent
  context?: "inherit" | "fresh"; // 默认 fresh
  prompt: string;
  produces: ArtifactSpec;
  gate?: Gate;
  mcp?: string[];
  skills?: string[];
};
```

**`context`**

| 值        | 语义                     | 用途                                          |
| --------- | ------------------------ | --------------------------------------------- |
| `inherit` | 在发起的 chat 会话里继续 | prompt 依赖对话共识（"按 Chat 中确认的方案"） |
| `fresh`   | 新起会话，不带既往上下文 | 需要独立视角（如换个 agent 审查自己的产出）   |

`context: inherit` 要求 `requires` 包含 `chat`。

### 3.2 ActionStage

确定性执行，不经过 LLM。

```ts
type ActionStage = StageBase & {
  kind: "action";
  op: ActionOp;
  confirm?: boolean; // 默认 true
  idempotencyKey?: string; // 有对外副作用时必填
  retry?: { max: number; backoffMs: number };
};
```

**`confirm`** 默认 `true`。凡是对外可见、回滚代价高的操作（提 PR、改任务状态、对外通知），保持默认。纯本地且可重跑的（跑测试、跑构建）显式设 `false`。

**`idempotencyKey`** 模板串，用于去重。同一个 key 已成功执行过就跳过，不重复产生副作用。触发器抖动、run 重跑、任务状态来回改时靠它兜底。

### 3.3 WaitStage

挂起等待外部信号，可跨应用重启存活。

```ts
type WaitStage = StageBase & {
  kind: "wait";
  for: SignalKind;
  timeoutMs?: number;
  onTimeout?: "fail" | "continue" | "ask"; // 默认 "ask"
};

type SignalKind =
  | "check-result" // 外部 CI/流水线结果
  | "review-decision" // 代码评审结论
  | "manual"; // 人工点确认
```

---

## 4. ActionOp

按跨 provider 的可抽象度分两类。能统一的给结构化 op，统一不了的给逃生舱。

```ts
type ActionOp =
  // 结构化
  | { type: "git.branch"; name: string }
  | { type: "git.commit"; message: string }
  | { type: "scm.open-pr"; title: string; body?: string; base: string }
  | { type: "tracker.transition"; to: string }
  | { type: "tracker.comment"; body: string }
  // 逃生舱
  | { type: "exec"; command: string; cwd?: string }
  | { type: "webhook"; url: string; method?: "POST" | "PUT"; body: string };
```

`tracker.transition` 的 `to` 是**语义状态名**，到具体系统（云效 / Jira / TAPD）实际状态的映射在 provider 配置里，workflow 定义不关心。

部署、提测这类跨团队差异极大、无共性可提的环节，用 `exec` 或 `webhook`，不为它们造结构化 op。

---

## 5. Gate

Stage 产出后的准入判定。分机器判定与 agent 裁决两类——这个区分是 gate 能被引擎执行的前提。

```ts
type Gate =
  | { type: "expr"; expr: string }
  | { type: "verdict"; maxSeverity: Severity }
  | { type: "human"; prompt: string };

type Severity = "low" | "medium" | "high";
```

| type      | 判定方 | 适用                                                    |
| --------- | ------ | ------------------------------------------------------- |
| `expr`    | 引擎   | 结构性条件：测试是否通过、diff 是否超范围、产物是否存在 |
| `verdict` | agent  | 质量性判断：代码质量、设计合理性                        |
| `human`   | 用户   | 不该让 agent 单方面拍板的判断（如缺陷根因认定）         |

`expr` 可访问 `artifacts.*` 与内置字段，例如：

```
artifacts.tests.failed == 0
artifacts.diff.filesOutsideProposal == 0
```

`verdict` gate 要求对应 stage 的 `produces.schema` 是 `verdict`，agent 必须输出结构化裁决而非散文。产物 severity 高于 `maxSeverity` 判为 fail。

**gate 由不参与执行的第三方判定**——引擎或用户。agent 不判定自己所在 stage 的 gate。

---

## 6. ArtifactSpec

```ts
type ArtifactSpec = {
  id: string; // 同一 workflow 内唯一，供后续 stage 与 expr 引用
  schema: ArtifactSchema;
};

type ArtifactSchema =
  | "diff" // { files: string[], insertions, deletions, filesOutsideProposal? }
  | "verdict" // { severity: Severity, issues: Issue[], evidence: string[] }
  | "plan" // { goal: string, steps: string[] }
  | "test-report" // { total, passed, failed, failures: string[] }
  | "freeform"; // 无结构约束，不能被 expr/verdict gate 消费
```

---

## 7. Transition

```ts
type Transition = {
  on: "pass" | "fail" | "signal";
  goto: string; // 目标 stage id
  maxLoops?: number; // goto 指向已访问过的 stage 时必填
};
```

| `on`     | 触发条件                                      |
| -------- | --------------------------------------------- |
| `pass`   | stage 成功且 gate 通过                        |
| `fail`   | stage 失败，或 gate 未通过                    |
| `signal` | WaitStage 收到信号（信号自带 pass/fail 语义） |

**回边**是这套 schema 与 DAG 的核心区别。`goto` 指回已访问过的 stage 时 `maxLoops` 必填，超出后 run 终止并报告卡在哪一环。

---

## 8. 模板变量

`prompt`、`op` 的字符串字段、`idempotencyKey` 支持插值。

| 命名空间      | 可用条件                 | 示例                                       |
| ------------- | ------------------------ | ------------------------------------------ |
| `run.*`       | 始终                     | `run.id`、`run.startedAt`                  |
| `task.*`      | `requires` 含 `task`     | `task.id`、`task.title`                    |
| `proposal.*`  | `requires` 含 `proposal` | `proposal.title`、`proposal.changeId`      |
| `plan.*`      | `requires` 含 `plan`     | `plan.goal`                                |
| `artifacts.*` | 对应 stage 已产出        | `artifacts.pr.url`、`artifacts.diff.files` |

引擎在**启动时**校验所有插值引用的命名空间在当前上下文可用，不满足直接拒绝启动。不能等跑到 `git.commit` 才发现 message 是 `fix: `。

---

## 9. 解析期校验

parser 必须拒绝的：

1. `stages` 为空，或 `id` 重复
2. `next` 与 `terminal` 同时缺失或同时存在
3. `goto` 指向不存在的 stage id
4. 存在从入口不可达的 stage
5. 回边缺 `maxLoops`
6. 没有任何 terminal stage
7. `gate.type: verdict` 但对应 `produces.schema` 不是 `verdict`
8. `expr` 引用了不存在的 artifact id
9. `context: inherit` 但 `requires` 不含 `chat`
10. 模板变量引用了 `requires` 未声明的命名空间
11. 有对外副作用的 op 缺 `idempotencyKey`

---

## 10. 示例

### 10.1 快速修复

最简形态。本地改动，无前置产物，只有一个确认点。

```yaml
name: 快速修复
version: 2
description: chat 内确认方案后直接实现，测试通过即提交
requires: [chat]
confirmStart: false

stages:
  - id: implement
    kind: agent
    name: 实现
    context: inherit
    prompt: 按 Chat 中确认的方案修改，范围限定在讨论涉及的文件
    produces: { id: diff, schema: diff }
    next: [{ on: pass, goto: verify }]

  - id: verify
    kind: action
    name: 跑测试
    op: { type: exec, command: "pnpm test" }
    confirm: false
    next:
      - { on: pass, goto: commit }
      - { on: fail, goto: implement, maxLoops: 2 }

  - id: commit
    kind: action
    name: 提交
    op: { type: git.commit, message: "fix: {{chat.summary}}" }
    confirm: true
    terminal: true
```

### 10.2 契约变更交付

重路径。含范围校验、换 agent 审查、两条回边、等待外部 CI。

```yaml
name: 契约变更交付
version: 2
description: 基于已批准 proposal 实施，经审查后提 PR 并等待 CI
requires: [proposal]
confirmStart: true

stages:
  - id: apply
    kind: agent
    name: 实现
    context: fresh
    prompt: 按已批准的 tasks.md 实施，不得超出 proposal 范围
    produces: { id: diff, schema: diff }
    gate: { type: expr, expr: "artifacts.diff.filesOutsideProposal == 0" }
    next:
      - { on: pass, goto: review }
      - { on: fail, goto: apply, maxLoops: 2 }

  - id: review
    kind: agent
    name: 审查
    agent: codex
    context: fresh
    prompt: 对照 proposal.md 与 design.md 审查实现，输出结构化裁决
    produces: { id: review, schema: verdict }
    gate: { type: verdict, maxSeverity: medium }
    next:
      - { on: pass, goto: archive }
      - { on: fail, goto: apply, maxLoops: 3 }

  - id: archive
    kind: agent
    name: 归档
    context: fresh
    prompt: 归档变更，抽取 specs，评估 guidelines 是否需要更新
    produces: { id: archive, schema: freeform }
    next: [{ on: pass, goto: pr }]

  - id: pr
    kind: action
    name: 提 PR
    op:
      type: scm.open-pr
      title: "{{proposal.title}}"
      base: main
    idempotencyKey: "pr:{{proposal.changeId}}"
    confirm: true
    next: [{ on: pass, goto: wait-ci }]

  - id: wait-ci
    kind: wait
    name: 等待 CI
    for: check-result
    timeoutMs: 1800000
    onTimeout: ask
    next:
      - { on: signal, goto: done }
      - { on: fail, goto: apply, maxLoops: 3 }

  - id: done
    kind: action
    name: 完成
    op: { type: tracker.comment, body: "已合入，PR: {{artifacts.pr.url}}" }
    confirm: false
    terminal: true
```

### 10.3 依赖升级

无人值守。全程 `confirm: false`，无 chat 上下文，靠 `idempotencyKey` 防重。

```yaml
name: 依赖升级
version: 2
description: 周期性升级 minor/patch 依赖并提 PR
requires: []
confirmStart: false

stages:
  - id: scan
    kind: action
    name: 扫描过期依赖
    op: { type: exec, command: "pnpm outdated --json" }
    confirm: false
    next:
      - { on: pass, goto: upgrade }
      - { on: fail, goto: stop }

  - id: upgrade
    kind: agent
    name: 升级并修复
    context: fresh
    prompt: |
      根据 artifacts.scan 升级 minor/patch 版本依赖，major 跳过并在产物中列出。
      修复升级引发的类型错误与测试失败。
    produces: { id: upgrade, schema: verdict }
    next: [{ on: pass, goto: check }]

  - id: check
    kind: action
    name: 校验
    op: { type: exec, command: "pnpm typecheck && pnpm test" }
    confirm: false
    next:
      - { on: pass, goto: pr }
      - { on: fail, goto: upgrade, maxLoops: 2 }

  - id: pr
    kind: action
    name: 提 PR
    op:
      type: scm.open-pr
      title: "chore(deps): 周度依赖升级"
      base: main
    idempotencyKey: "deps-pr:{{run.startedAt | date('YYYY-WW')}}"
    confirm: false
    next: [{ on: pass, goto: notify }]

  - id: notify
    kind: action
    name: 通知
    op:
      type: webhook
      url: "{{secrets.NOTIFY_HOOK}}"
      body: '{"text":"依赖升级 PR 已创建：{{artifacts.pr.url}}"}'
    confirm: false
    terminal: true

  - id: stop
    kind: action
    name: 无可升级依赖
    op: { type: exec, command: "true" }
    confirm: false
    terminal: true
```

### 10.4 缺陷修复

含人工判定闸门与任务系统回写。

```yaml
name: 缺陷修复
version: 2
description: 定位根因后修复，补回归测试，提测
requires: [task]
confirmStart: true

stages:
  - id: triage
    kind: agent
    name: 定位根因
    context: fresh
    prompt: |
      根据 {{task.description}} 定位根因。
      读取相关模块 guidelines 与历史 lineage，判断此问题此前是否出现过。
    produces: { id: rootcause, schema: verdict }
    gate: { type: human, prompt: "根因判断是否成立？" }
    next:
      - { on: pass, goto: fix }
      - { on: fail, goto: triage, maxLoops: 2 }

  - id: fix
    kind: agent
    name: 修复
    context: fresh
    prompt: 修复 artifacts.rootcause 指出的根因，并补一个能复现该问题的回归测试
    produces: { id: diff, schema: diff }
    next: [{ on: pass, goto: check }]

  - id: check
    kind: action
    name: 跑测试
    op: { type: exec, command: "pnpm test" }
    confirm: false
    next:
      - { on: pass, goto: pr }
      - { on: fail, goto: fix, maxLoops: 3 }

  - id: pr
    kind: action
    name: 提 PR
    op:
      type: scm.open-pr
      title: "fix: {{task.title}}"
      base: release
    idempotencyKey: "fix-pr:{{task.id}}"
    confirm: true
    next: [{ on: pass, goto: link }]

  - id: link
    kind: action
    name: 回写任务
    op:
      type: tracker.comment
      body: "已提交修复 {{artifacts.pr.url}}"
    confirm: false
    next: [{ on: pass, goto: wait-ci }]

  - id: wait-ci
    kind: wait
    name: 等待 CI
    for: check-result
    timeoutMs: 1800000
    onTimeout: ask
    next:
      - { on: signal, goto: handoff }
      - { on: fail, goto: fix, maxLoops: 3 }

  - id: handoff
    kind: action
    name: 提测
    op: { type: tracker.transition, to: 待测试 }
    idempotencyKey: "handoff:{{task.id}}"
    confirm: true
    terminal: true
```
