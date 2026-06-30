---
title: Using Plan and SDD to Triage Agent Workflows
description: Based on FylloCode's OpenSpec practice, this essay discusses the boundary between Plan and SDD, and how to triage Agent workflows by risk.
sidebar:
  order: 5
---

# Using Plan and SDD to Triage Agent Workflows

> FylloCode has already created 100+ proposals through OpenSpec, accumulated 80+ specs files, and grown to nearly 30k lines of source code. Through this process, I started to ask whether `SDD` is really the best practice for every engineering task, which requirements should use SDD, which ones only need Plan, and how to define the boundary between them.

As Vibe Coding became popular, more people started to realize that building software only by "vibes" makes codebases increasingly hard to maintain. Every new conversation with an Agent can feel like starting from scratch. After several sessions, the architecture can start drifting. That is why many people started advocating Spec-Driven Development (SDD). I am one of them.

No matter whether people use `spec-kit`, `OpenSpec`, `GSD`, `Superpowers`, or other tools, most of them maintain some form of spec workflow. The central idea is similar: write the spec first, make it the `source of truth` for the codebase, and then generate or implement code based on those specs.

## Starting from SDD

The following diagram comes from InfoQ's article on SDD.
![SDD Governed Software Delivery Pipeline](https://imgopt.infoq.com/fit-in/3000x4000/filters:quality(85)/filters:no_upscale()/articles/spec-driven-development/en/resources/78figure-4-1767777705864.jpg)

The SDD workflow is roughly:

1. Write the specification: define requirements and scenarios in a structured form.
2. Review the specification: verify that it matches the original intent.
3. Implement the specification: use it to guide the Agent.
4. Verify the result: check whether the implementation satisfies the spec.
5. Update the specification: keep specs in sync as the system evolves.

Its benefits are obvious:

- It becomes the `source of truth` for the engineering project.
- Clear specs help prevent implementation drift.
- Project-level specs support team collaboration.

SDD also has limitations:

- Creating specs costs time and tokens.
- It usually works best with dedicated tools such as `OpenSpec`.
- It binds the task to a workflow, which can be too heavy for small changes.
- The whole team needs to keep the specs up to date.

In FylloCode's practice, the most valuable part of SDD is not "writing documents first". Its real value is that it stabilizes decisions that may affect multiple people, multiple conversations, and multiple commits. It is suitable for long-lived engineering contracts, such as public interfaces, storage structures, cross-module responsibilities, and user-visible behavior.

But it should not be overused. If the user only wants to fix copy, add tests, add comments, or adjust guidelines, forcing the task into the Proposal flow makes the Agent focus on the process itself instead of the problem. Governance should not make everything heavier. It should put work with different risk levels onto the right path.

## The Value of Plan Mode

Plan mode is often discussed together with SDD. Compared with SDD, it is much lighter, and many Coding Agents already provide it. The workflow is usually:

1. Describe the task in natural language.
2. The Agent explores and creates a plan.
3. The user reviews the plan and gives feedback.
4. The Agent implements the plan.

Plan mode has several benefits:

- It costs less than SDD.
- It helps explore multiple approaches quickly.
- It works well for small features or unclear requirements.
- It is more flexible than SDD.

Plan mode also has problems:

- Different Agents implement it differently. Some write temporary files, some write into the project, and some only keep the plan in memory.
- A plan is usually tied to the current conversation.
- When multiple approaches are explored, there may be no stable reference if the implementation drifts.
- After enough time passes, it becomes hard to verify whether the result still matches the original intent.

When I started building FylloCode, I was thinking about how future developers would work. I believe programmers will get closer to frontline business. The coding phase will no longer need as much old-school manual programming. Developers will need to review systems from a higher level and judge whether the architecture is reasonable. As long as the high-level design does not drift, implementation can be delegated to Agents.

But today FylloCode only has SDD. When facing small changes, Agents still tend to create specs first. This makes some small features more expensive than they should be. That is clearly not a good design. I built FylloCode to govern Coding Agents, so it should not force users into a workflow that does not fit the task.

So FylloCode needs a correction. It should not force every task through the `Task->Chat->Proposal->Archive` path. It should choose the right tool based on the situation. Since different Agents implement Plan mode differently, and ACP does not provide a unified Plan integration, FylloCode needs to provide its own `plan` tool and connect plan into lineage. In that way, a plan.md that is tied to a conversation can also become available to future conversations through lineage, preserving the decision context from that moment.

There also needs to be a clear rule, so an Agent can decide whether to implement directly, create a plan, or go through the spec proposal flow.

## Task Triage

I now tend to divide FylloCode's workflow into three layers:

1. Direct implementation: local, clear, low-risk, reversible changes, such as fixing copy, adjusting one style, or adding a small test.
2. Plan: tasks that do not change external contracts, but involve multiple files, multiple possible approaches, architectural tradeoffs, or risk judgment.
3. Proposal: tasks that change external contracts, such as IPC, schema, storage formats, user-visible behavior, or cross-module responsibility boundaries.

This triage has two escalation rules:

1. If Plan discovers that the task will change external contracts, it should be escalated to Proposal.
2. If a Proposal is not clear enough before implementation, Plan can be used for exploration first, and the finalized result can then be written into the Proposal.

In this model, Plan and SDD are not competitors. Plan is responsible for exploration and decision-making. Proposal is responsible for solidifying long-lived contracts. Direct implementation is reserved for simple tasks that should not be inflated by process.

## What I Learned from the Community Discussion

A Codex maintainer started a GitHub Discussion about [Plan/Spec mode](https://github.com/openai/codex/discussions/7355), raising several design questions:

- Do users prefer a fixed workflow or a more flexible one?
- Should entering Plan mode be automatic, or should it require an explicit switch?
- Should Plan be temporary, or persisted to a file?
- Should the interaction be interview-style, or freeform?
- Should the Agent produce a simple first plan, or do deeper analysis, exploration, and web search? How much should the user guide that depth?

After reading the community discussion, I focused on four questions:

1. Should users explicitly enter Plan?
2. Should Plan be persisted?
3. When should Plan ask questions, and when should it directly produce a proposal?
4. Should Plan be a rough checklist, or an executable engineering plan?

Because FylloCode already has specs, my thinking about Plan mode is:

- Entering Plan should have a **low cost**. FylloCode is a governance layer for Coding Agents, but most of the time we treat it as a teammate. When talking to a teammate, using a button, switch, or dropdown to explicitly "enter Plan mode" feels a little strange.
- Plan should be **lightweight**, but it must not modify code. During Plan, the Agent can only explore and generate a plan. Plan does not need a fixed workflow. The Agent should be free to use tools for analysis.
- Plan should be **flexible**. Its output should be a persisted plan.md. The user can review and edit the plan, and after approval, the Agent implements according to the latest version of plan.md.
- Plan should be **deep enough**. The produced plan.md must be executable. It cannot be a "plan for making a plan". The Agent should explore and analyze enough to produce a concrete implementation path.

## Where Plan Fits in FylloCode

Plan should not be just a temporary piece of chat content. Temporary chat feels natural inside the current conversation, but after switching sessions, switching Agents, or coming back later, the decision context becomes hard to recover.

So I prefer to define Plan as an intermediate engineering decision artifact. It is not as heavy as Proposal, and it is not responsible for becoming a long-term spec. But it also should not disappear like ordinary chat. It should connect to task, session, proposal, and commit, becoming part of Lineage.

A complex task can then follow this path:

1. The user describes a requirement.
2. The Agent decides that it does not need Proposal, but does need Plan.
3. The Agent enters read-only exploration, reads code, sorts out constraints, and compares approaches.
4. The Agent produces plan.md.
5. The user reviews, edits, or approves it.
6. The Agent implements according to the final version of plan.md.
7. Lineage records the relationship between this Plan and the later implementation.

If the implementation later shows that plan.md is no longer valid, the Agent should return to Plan and update it, instead of drifting freely during implementation. If Plan discovers that the task actually changes a contract, it should be escalated to Proposal. This boundary matters because it makes Plan part of governance, not another uncontrolled entry point for freeform execution.

## The Boundary of Plan

The easiest failure mode of Plan is that it looks like planning, but actually only produces a plan to "continue researching next". That kind of plan does not help engineering or users, because it does not reduce uncertainty and does not give the implementation clear constraints.

So a FylloCode plan.md should at least include:

1. Goal: what problem this task needs to solve.
2. Scope: what will change, and what will not.
3. Key constraints: existing architecture, data model, IPC, UI, or testing constraints.
4. Tradeoffs: why this approach is chosen, and which alternatives were rejected.
5. Implementation steps: a path the Agent can follow step by step.
6. Verification: how to prove that the change is correct after implementation.

At the same time, Plan must be read-only by default. The Agent can search, read, analyze, compare approaches, and generate plan.md, but it cannot directly modify business code. Only after the user approves plan.md should the Agent enter implementation. The goal is not to add ceremony. It is to separate "thinking" from "execution", so the user can intervene at key decision points.

Returning to the original question, I do not think Plan and SDD are competitors. SDD is not wrong, and Plan is not a more advanced replacement. The real issue is that after Agents enter software development, a project no longer needs one fixed workflow. It needs an engineering governance mechanism that can triage work by risk. Simple tasks should be implemented directly. Complex tasks should start with Plan. Tasks that change contracts should go through Proposal. What FylloCode needs to do is make all three paths something Agents can follow reliably.

## References

- [What Is Spec-Driven Development? A Complete Guide](https://www.augmentcode.com/guides/what-is-spec-driven-development)
- [Spec Driven Development: When Architecture Becomes Executable](https://www.infoq.com/articles/spec-driven-development/)
- [Spec-Driven Development: From Code to Contract in the Age of AI Coding Assistants](https://arxiv.org/html/2602.00180v1)
- [Plan / Spec Mode Discussion](https://github.com/openai/codex/discussions/7355)
