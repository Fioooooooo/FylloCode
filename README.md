<p align="center">
  <img src="build/icon.png" width="120" alt="FylloCode" />
</p>

<h1 align="center">FylloCode</h1>

<p align="center">
  A desktop app that turns Coding Agents into reliable teammates —<br/>
  by splitting every change into <strong>Task → Proposal → Apply → Archive</strong>,<br/>
  with you reviewing the plan before any code is written.
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文</a> ·
  <a href="https://github.com/Fioooooooo/FylloCode/releases">Download</a>
</p>

<!-- TODO: replace with actual screenshot -->
<!-- ![FylloCode Screenshot](docs/images/screenshot.png) -->

---

## Why FylloCode

In this new era, the work that really needs our attention is no longer repetitive coding, but higher-level business understanding and architecture design. The future workflow I have in mind is: understand the business → think through the architecture → write a Proposal → review the Proposal → let the Agent implement it automatically, then move on to the next Proposal.

That thinking led me to build FylloCode — a step from Vibe Coding toward Agentic Coding.

## How FylloCode Solves It

FylloCode enforces a structured workflow that separates **thinking** from **doing**:

```
┌──────────┐     ┌────────────────┐     ┌───────────┐     ┌───────────┐
│   Task   │ ──→ │ Chat/Proposal  │ ──→ │   Apply   │ ──→ │  Archive  │
│          │     │                │     │           │     │           │
│ What to  │     │ Agent explores │     │ Agent     │     │ Specs     │
│ work on  │     │ codebase and   │     │ implements│     │ updated,  │
│          │     │ writes a plan  │     │ the plan  │     │ change    │
│          │     │                │     │           │     │ recorded  │
│          │     │  ➜ YOU REVIEW  │     │           │     │           │
└──────────┘     └────────────────┘     └───────────┘     └───────────┘
```

**Task** — Pick a task from your local list or synced from platforms like Yunxiao. One click sends it to Chat.

**Chat / Proposal** — The Agent explores your codebase, asks clarifying questions, and produces a structured proposal (what to change, which files, acceptance criteria). The Agent is _prohibited from writing code_ in this stage. You review, edit, and approve the proposal before anything else happens.

**Apply** — A fresh Agent session implements the approved proposal task-by-task. It reads only the proposal artifacts — not the Chat history — so every decision must be captured in writing, not left in context-window memory.

**Archive** — Specs are updated, the change is recorded with full traceability. Your project's knowledge base grows with every shipped change.

### Why Separating Thinking from Execution Matters

Most Coding Agents understand a task and write code in the same session. Any misunderstanding becomes code directly, and code is expensive to review.
FylloCode physically separates understanding from execution. Misunderstandings can only become proposal text — and text is cheap to review. A 2-minute proposal review catches problems that would take 20 minutes to find in a diff.

## Features

### Agent Protocol (ACP)

FylloCode connects to any Coding Agent through ACP (Agent Client Protocol). Claude Code, Codex, or any ACP-compatible agent — one protocol, one interface, without juggling a pile of terminal windows.

There are currently 35 agents available in the ACP Registry, with support for parallel chats and parallel Proposal Apply runs.

![FylloCode-ACP](docs/screenshot/acp-registry.png)

### System Reminders

Each workflow stage injects a system reminder that constrains what the Agent can and cannot do. In Chat, the Agent is instructed to explore and propose, not code. In Apply, it follows the approved task list. This isn't a suggestion — it's a hard boundary enforced at session start.

![FylloCode-Chat](docs/screenshot/chat.png)

### Task Panel

View and manage tasks from your local list or synced from external platforms. Tasks serve as the entry point to the entire workflow — select a task, start a Chat, and the Agent begins with full context.

![FylloCode-Task](docs/screenshot/task.png)

### Integration with Development Platforms

Connect to platforms like Yunxiao (Alibaba Cloud DevOps) at the provider level — one authentication, multiple tools across task management, source code, and CI/CD. More platform integrations (GitHub, TAPD, Jira, etc.) are planned.

Task integrations use APIs instead of Agent Skills by design. API calls are fast and do not spend tokens, so tokens stay focused on the work that actually needs reasoning.

![FylloCode-Integration](docs/screenshot/integration-provider.png)

### Workflow Editor

Define and customize multi-stage workflows. Built-in templates get you started; edit the YAML to fit your team's process.

![FylloCode-Workflow](docs/screenshot/workflow.png)

### OpenSpec-Driven Proposals

Proposals are structured artifacts — not chat messages. Each proposal contains a design document, spec changes, and a concrete task list with file paths and acceptance criteria. The built-in `fyllo-specs` MCP server manages the full lifecycle: explore → create-proposal → apply-change → archive-change.

![FylloCode-Proposal-list](docs/screenshot/proposal-list.png)

![FylloCode-Proposal-detail](docs/screenshot/proposal-detail.png)

### Streaming Rendering Engine

FylloCode uses [markstream-vue](https://github.com/Simon-He95/markstream-vue) as its streaming rendering engine. It is fast and smooth, with built-in integration for Monaco Editor, KaTeX, and Mermaid. While working on Proposals, it can render flowcharts and formatted specs in real time, making architecture flows and business logic easier to inspect.

### Engineering Guardrails

FylloCode provides two layers of engineering guardrails:

- Soft constraints — Capture engineering conventions as Guidelines and continuously maintain them through the built-in `fyllo-skills` MCP server, without manual upkeep.
- Hard constraints — Agents may not always follow Guidelines perfectly, so FylloCode's health checks establish engineering-level enforcement through lint, test runners, git hooks, and CI.

## Quick Start

### Download

Pre-built binaries for macOS, Windows, and Linux are available on the [Releases](https://github.com/Fioooooooo/FylloCode/releases) page.

| Platform | Format                         |
| -------- | ------------------------------ |
| macOS    | `.dmg`                         |
| Windows  | `.exe` (NSIS installer)        |
| Linux    | `.AppImage` / `.deb` / `.snap` |

### Build from Source

Requires Node.js ≥ 22 and pnpm.

```bash
git clone https://github.com/Fioooooooo/FylloCode.git
cd FylloCode
pnpm install
pnpm dev
```

### First Steps

1. Open FylloCode and create or open a project (any local directory with code).
2. Go to **Settings → Providers** and install an ACP-compatible agent (e.g., Claude Code).
3. Head to the **Task** panel, create a task, and click to start a Chat.
4. The Agent will explore your codebase and produce a proposal. Review it, then run Apply.

## Todo

- [ ] More integration(TAPD, Jira, Linear, Github)
- [ ] Auto-update
- [ ] i18n (English UI)
- [ ] Auto build guidelines
- [x] Git linked workspace for task apply
- [ ] More ACP Agent control

## Built With

Electron · Vue 3 · TypeScript · ACP SDK · MCP SDK · Nuxt UI · Tailwind CSS

## License

[AGPL-3.0](LICENSE)

## Community

[LinuxDO](https://linux.do/): sincere, friendly, united, and professional
