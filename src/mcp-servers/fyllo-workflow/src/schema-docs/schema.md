# Workflow Definition Schema

状态：draft
日期：2026-08-10

本文档只定义 workflow 的定义态 schema（用户编写的 YAML）与示例。运行态持久化、触发器绑定、UI 集成不在本文档范围内。

---

## 1. 控制流模型

Workflow 是一个带守卫条件的状态机，不是 DAG。

- 单活动：任意时刻只在一个 stage 上。
- 允许回边：`next` 可以指向已访问过的 stage，用 `maxLoops` 约束。
- 转移由 `pass` / `fail` / `signal` 事件驱动。

进度由“当前 stage + 每个 stage 的访问次数”表示，而不是已完成节点集合。

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

声明启动 workflow 所需的输入上下文。引擎在启动前校验，不满足时拒绝启动。

```ts
type ContextKind = "proposal" | "plan" | "task" | "chat";
```

| 值         | 含义                       | 可用模板变量                        |
| ---------- | -------------------------- | ----------------------------------- |
| `proposal` | 存在已批准的 proposal      | `proposal.*`、`tasks.*`             |
| `plan`     | 存在会话级 plan            | `plan.*`                            |
| `task`     | 关联了一个 task            | `task.*`                            |
| `chat`     | 由 chat 发起，有对话上下文 | `chat.*`，且允许 `context: inherit` |

`requires: []` 表示无前置条件，任何触发源都能启动。

### 2.2 `confirmStart`

`true` 时启动前需要用户确认一次；`false` 直接开跑。起 worktree、有对外副作用或预计时长较长的流程通常应设为 `true`。

---

## 3. Stage

三种 kind 共享 `id` / `name` / `next`，其余字段互不相同。

```ts
type Stage = AgentStage | ActionStage | WaitStage;

type StageBase = {
  id: string; // workflow 内唯一
  name?: string; // 展示名，缺省用 id
  next?: Transition[]; // 缺省时必须显式 terminal: true
  terminal?: boolean; // 默认 false
};
```

`next` 与 `terminal` 必须恰好有一个生效。

### 3.1 AgentStage

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

`inherit` 在发起的 chat 会话里继续，`fresh` 新起不带既往上下文的会话。`context: inherit` 要求 `requires` 包含 `chat`。

### 3.2 ActionStage

```ts
type ActionStage = StageBase & {
  kind: "action";
  op: ActionOp;
  confirm?: boolean; // 默认 true
  idempotencyKey?: string; // 有对外副作用时必填
  retry?: { max: number; backoffMs: number };
};
```

`confirm` 默认 `true`；纯本地且可重跑的操作可显式设为 `false`。

### 3.3 WaitStage

```ts
type WaitStage = StageBase & {
  kind: "wait";
  for: SignalKind;
  timeoutMs?: number;
  onTimeout?: "fail" | "continue" | "ask"; // 默认 ask
};

type SignalKind = "check-result" | "review-decision" | "manual";
```

---

## 4. ActionOp

```ts
type ActionOp =
  | { type: "git.branch"; name: string }
  | { type: "git.commit"; message: string }
  | { type: "scm.open-pr"; title: string; body?: string; base: string }
  | { type: "tracker.transition"; to: string }
  | { type: "tracker.comment"; body: string }
  | { type: "exec"; command: string; cwd?: string }
  | { type: "webhook"; url: string; method?: "POST" | "PUT"; body: string };
```

结构化 op 用于跨 provider 可抽象的动作；部署、提测等差异很大的环节可使用 `exec` 或 `webhook`。

---

## 5. Gate

```ts
type Gate =
  | { type: "expr"; expr: string }
  | { type: "verdict"; maxSeverity: Severity }
  | { type: "human"; prompt: string };

type Severity = "low" | "medium" | "high";
```

`expr` 由引擎判断结构性条件，`verdict` 由 agent 产出质量性判断，`human` 由用户判断。`expr` 可访问 `artifacts.*`，`verdict` 要求对应 `produces.schema` 为 `verdict`；gate 不由所在 stage 的 agent 自己判定。

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

`pass` 表示 stage 成功且 gate 通过，`fail` 表示 stage 失败或 gate 未通过，`signal` 表示 WaitStage 收到信号。回边指向已访问 stage 时必须提供 `maxLoops`。

---

## 8. 模板变量

`prompt`、`op` 的字符串字段、`idempotencyKey` 支持插值。

| 命名空间      | 可用条件                 | 示例                                  |
| ------------- | ------------------------ | ------------------------------------- |
| `run.*`       | 始终                     | `run.id`、`run.startedAt`             |
| `task.*`      | `requires` 含 `task`     | `task.id`、`task.title`               |
| `proposal.*`  | `requires` 含 `proposal` | `proposal.title`、`proposal.changeId` |
| `plan.*`      | `requires` 含 `plan`     | `plan.goal`                           |
| `artifacts.*` | 对应 stage 已产出        | `artifacts.pr.url`                    |

引擎在启动时校验所有插值引用的命名空间在当前上下文可用，不满足就拒绝启动。

---

## 9. 解析期校验

parser 必须拒绝：

1. `stages` 为空或 `id` 重复。
2. `next` 与 `terminal` 同时缺失或同时存在。
3. `goto` 指向不存在的 stage id。
4. 存在从入口不可达的 stage。
5. 回边缺 `maxLoops`。
6. 没有任何 terminal stage。
7. `gate.type: verdict` 但 `produces.schema` 不是 `verdict`。
8. `expr` 引用了不存在的 artifact id。
9. `context: inherit` 但 `requires` 不含 `chat`。
10. 模板变量引用了 `requires` 未声明的命名空间。
11. 有对外副作用的 op 缺 `idempotencyKey`。

schema 合法不等于当前运行时可执行；Phase 1 execution profile 由 `trigger_workflow` 在创建 Run 前单独检查。

---
