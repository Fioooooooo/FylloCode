## 10. 示例

### 10.1 快速修复

```yaml
name: 快速修复
version: 2
description: chat 内确认方案后直接实现，测试通过即提交
requires: [chat]
confirmStart: false

stages:
  - id: implement
    kind: agent
    context: inherit
    prompt: 按 Chat 中确认的方案修改，范围限定在讨论涉及的文件
    produces: { id: diff, schema: diff }
    next: [{ on: pass, goto: verify }]
  - id: verify
    kind: action
    op: { type: exec, command: "pnpm test" }
    confirm: false
    next:
      - { on: pass, goto: commit }
      - { on: fail, goto: implement, maxLoops: 2 }
  - id: commit
    kind: action
    op: { type: git.commit, message: "fix: {{chat.summary}}" }
    confirm: true
    terminal: true
```

### 10.2 契约变更交付

```yaml
name: 契约变更交付
version: 2
description: 基于已批准 proposal 实施，经审查后提 PR 并等待 CI
requires: [proposal]
confirmStart: true

stages:
  - id: apply
    kind: agent
    context: fresh
    prompt: 按已批准的 tasks.md 实施，不得超出 proposal 范围
    produces: { id: diff, schema: diff }
    gate: { type: expr, expr: "artifacts.diff.filesOutsideProposal == 0" }
    next:
      - { on: pass, goto: review }
      - { on: fail, goto: apply, maxLoops: 2 }
  - id: review
    kind: agent
    agent: codex
    context: fresh
    prompt: 对照 proposal.md 与 design.md 审查实现，输出结构化裁决
    produces: { id: review, schema: verdict }
    gate: { type: verdict, maxSeverity: medium }
    next:
      - { on: pass, goto: done }
      - { on: fail, goto: apply, maxLoops: 3 }
  - id: done
    kind: action
    op: { type: tracker.comment, body: "实现已审查" }
    confirm: false
    terminal: true
```

### 10.3 依赖升级

```yaml
name: 依赖升级
version: 2
description: 周期性升级 minor/patch 依赖并提 PR
requires: []
confirmStart: false

stages:
  - id: scan
    kind: action
    op: { type: exec, command: "pnpm outdated --json" }
    confirm: false
    next: [{ on: pass, goto: stop }]
  - id: stop
    kind: action
    op: { type: exec, command: "true" }
    confirm: false
    terminal: true
```

### 10.4 缺陷修复

```yaml
name: 缺陷修复
version: 2
description: 定位根因后修复，补回归测试，提测
requires: [task]
confirmStart: true

stages:
  - id: triage
    kind: agent
    context: fresh
    prompt: 根据 {{task.description}} 定位根因
    produces: { id: rootcause, schema: verdict }
    gate: { type: human, prompt: "根因判断是否成立？" }
    next: [{ on: pass, goto: fix }, { on: fail, goto: triage, maxLoops: 2 }]
  - id: fix
    kind: agent
    context: fresh
    prompt: 修复 artifacts.rootcause 指出的根因，并补回归测试
    produces: { id: diff, schema: diff }
    next: [{ on: pass, goto: done }]
  - id: done
    kind: action
    op: { type: tracker.transition, to: 待测试 }
    idempotencyKey: "handoff:{{task.id}}"
    confirm: true
    terminal: true
```
