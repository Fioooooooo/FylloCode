---
title: Loop Engineering
description: My thoughts on Loop Engineering from the perspective of development loops, Agent workflows, and engineering governance, and why FylloCode was designed with tasks, workflows, integrations, and knowledge capture from the beginning.
sidebar:
  order: 6
---

# Loop Engineering

Loop Engineering means using a designed loop system to replace the manual act of sending
instructions to an Agent every time. When I first heard the term, the first thing that came to
mind was: "Damn, this can be a new term too?"

But I do agree with the idea. It is also one of FylloCode's goals. When FylloCode was initialized,
I was already thinking about this path: scheduled tasks driving fixed workflows, or scheduled tasks
driving open-ended Agent work. That is why FylloCode was designed with tasks, workflows,
third-party integrations, and scheduled tasks from the beginning. I just have not had time to fully
build out the cycle layer yet, because the current focus is still polishing ACP Agents and Agent
workflows.

I do not think Loop Engineering appeared out of nowhere. If we look back at the daily work of
software engineers, it is already made of loops. We were just inside those loops before, so we did
not always abstract them into a system.

Take a typical engineer as an example:

- Wake up in the morning and check the phone for alerts from last night.
- Arrive at the desk and open the task management system to see whether new tasks were assigned, or
  whether yesterday's bug passed QA.
- Pick up a requirement or bug, then start system analysis and solution design.
- Modify code and deploy to the test environment.
- Notify upstream and downstream teams that the task is done.
- Continue watching test feedback, production metrics, and the next batch of requirements.

Requirements, code, tests, releases, monitoring, and feedback keep flowing back into the next task.
The value of an engineer is not only finishing one requirement. It is continuously making judgments
inside this loop: what should be automated, what should become a rule, where human review must stay,
and what can be handed over to the system.

In the Agent era, model companies want Agents to take over one task after another, so it is natural
that things move in this direction. But the current `Loop` idea is still early. If a loop runs in a
fully AI-native way, it consumes a lot of tokens. Maybe only model companies can afford that. I even
feel this may be one of the reasons they are willing to push this shape forward.

So when I first designed FylloCode, I decided to prioritize API-based integrations. The reason is
simple: APIs are faster, more stable, and do not consume tokens. For high-frequency actions such as
reading tasks, writing status back, triggering pipelines, and updating tickets, if we ask an Agent
to "understand it once" through natural language and tool calls every time, our wallets will shrink
very quickly.

The real value of Loop Engineering is to turn questions like what should loop, when it should stop,
where results should be written back, and how the next run can reuse them into engineering problems.

## What a Coding Loop Needs

If we design a `Loop` for coding, I think it needs at least these parts:

1. Scheduled system: the starting point of many loops. It lets work start without depending only on
   a human.
2. Information sources: project management systems, metrics systems, logging systems, or a prompt
   provided by the user.
3. Agent: an autonomous Agent receives the information, analyzes and filters it, then decides
   whether to continue.
4. Workflow: information can go directly to the Agent, or a scheduled system can trigger a fixed
   workflow. The two can also be combined.
5. Knowledge capture: solved problems, decisions, and lessons learned should be reusable by future
   tasks.
6. Result writeback: every loop result should ideally go back to the original task, ticket, monitor,
   or project context.

These parts look like a product feature list, but they are really architectural boundaries. The
scheduled system handles triggering. Information sources handle input. The Agent handles judgment.
The workflow constrains actions. Knowledge capture enables reuse. Result writeback closes the loop.

This is what I have been thinking about while building FylloCode. Agent workflows should not just be
"wrap a prompt and run it in a loop". They should become a traceable development system that can
capture what happened.

## Scheduled System

This is the starting point of the loop. One reason OpenClaw surprised me is that it has scheduled
tasks built in. This means OpenClaw can proactively communicate with the user.

I do not think a good scheduled system should be just a cron expression. It should at least be able
to select a project, run a custom prompt, choose different Agents and models, and show run frequency,
run status, and execution environment. A task can run locally or in the cloud, but the project
context, permission boundary, and execution record behind it must be clear.

The Agent, workflow, and the Skills and MCP pieces I have not expanded on here should all be
configurable inside a task. Otherwise, the scheduled system is just "waking up the Agent on time",
not a real scheduling entry point for a development loop.

## Information Sources

Information sources can take many forms, but they must exist.

They can be new tasks from a project management system, just like FylloCode first integrated with
Yunxiao work items. They can also be alerts from a monitoring system, exception patterns from logs,
or even a user-written prompt such as `call xx skill to check xx status`.

Information sources are not necessarily used only at the start of a scheduled task. They may trigger
at a fixed frequency and keep checking whether a condition has been reached. For example, whether a
pipeline failed, whether an MR passed review, or whether a task entered a processable state.

Here I prefer making information retrieval a deterministic API capability instead of leaving all
exploration to the Agent. Agents are good at judgment and synthesis, but high-frequency,
structured, predictable information retrieval should use stable interfaces as much as possible. That
way, the loop does not spend tokens on repetitive low-value work.

## Agent and Workflow

Agent and workflow are two different things, but they can be combined.

One approach is to let an autonomous Agent handle open-ended information and call different
workflows based on the situation. For example, after seeing an alert, it first judges the impact
scope, then decides whether to create a bug, notify the owner, or start a diagnostic flow.

Another approach is to trigger a fixed workflow directly, then hand one node in the middle to the
Agent. For example, first pull the task, create a worktree, read project guidelines, then let the
Agent analyze the solution, and finally enter implementation or wait for human confirmation.

I prefer combining these two instead of handing all ownership to the Agent. In real engineering,
open-ended judgment and deterministic process both exist. What we need to do is not design a system
that is "fully free" or "fully fixed", but put uncertainty in the right place.

Agents can think freely, but they should think inside clear project boundaries, permission
boundaries, and workflow boundaries. Workflows can move forward in a fixed way, but when judgment is
needed, they should also allow Agents to analyze and make tradeoffs. Only by combining the two can
we get automation gains without losing engineering control.

## Knowledge Capture

Knowledge capture is one of the core reasons I am building FylloCode.

Agents should not only help us do coding. They should also solidify knowledge from the process and
help future decisions. Otherwise every loop is like a new conversation: search again, understand
again, make the same mistake again, and wait for a human to remind it again.

FylloCode already has lineage. It is one form of knowledge capture. Through lineage, we can know why
decisions were made at that time: where the task came from, what was discussed, which decisions were
made along the way, how the Proposal formed, and which commits eventually landed.

But lineage is not everything. FylloCode will soon ship a feature that captures knowledge during the
conversation itself. It serves a different direction from lineage. For example, when you are solving
a difficult bug, you may try many things and spend a lot of time. FylloCode can extract key
information from that process as reusable knowledge for the future. But this kind of knowledge does
not necessarily belong in lineage, because it is not the narrative of one task. It is part of the
project's experience.

This distinction matters. Not all information should go into the same container. In architecture
design, whether data is long-lived, who should consume it, when it should be surfaced, and whether
it needs human review all affect whether it should land in lineage, spec, guideline, or knowledge.

If these destinations are not separated clearly, the knowledge system eventually becomes a dumping
ground. It looks like everything is remembered, but when you actually need to use it, nothing feels
reliable.

## Result Writeback

Many people talk about triggering and execution when discussing loops, but I think writeback is just
as important.

If a task comes from a project management system, the result should be able to go back to that
system. If an alert comes from a monitoring platform, the diagnosis and actions taken should be
linked back to the alert. If one Agent run generates a solution, code, and test results, that
information should also be able to return to the project's own lineage or knowledge system.

Without writeback, a loop is not really a closed loop. It is just one automated execution.

This is why FylloCode treats third-party integrations as a foundational capability instead of just
building an Agent chat shell. In team engineering, tasks, code, tests, releases, and tickets are
already scattered across different systems. FylloCode should not replace those systems. It should
connect Agent work results back into them, so the team's existing toolchain continues to hold.

## Parallel Work

There is another point that many loop discussions do not explicitly mention, but FylloCode has
already built into the implicit flow very early: git worktree.

I had already considered that after Coding Agents accelerate development, people will not be
satisfied with executing tasks sequentially. If Agents can move multiple requirements forward at
the same time, then we need clean git worktrees so different tasks can progress in different working
directories without affecting the main worktree.

The parallel capability brought by this small detail will directly change how development work is
organized.

In the past, when one person worked on several requirements at the same time, the real bottlenecks
were context switching and code conflicts. But after Agents enter the process, as long as task
boundaries, project context, execution environments, and writeback relationships are managed by the
system, humans can move from "writing every line of code personally" to "reviewing multiple
engineering loops in progress".

This is where the way we develop software will change. The value of future programmers will
concentrate more on judgment, decomposition, boundary design, risk identification, and final
acceptance, instead of spending all their time on mechanical coding.

## What Loops Cannot Do

The current idea of Loop only replaces part of manual work with Agent-driven loops. But exceptions
do not disappear because of automation. They may even become harder to handle.

Loop Engineering is a natural development in the AI era. From Prompt Engineering to Context
Engineering, and then to Harness Engineering, Agents have been able to do more as models themselves
become stronger and as context and tools become richer. Loop Engineering may also just be a
temporary stop in this era. It has value, but it should not be mythologized.

During this process, verification becomes harder.

Unattended looping tasks also mean unattended looping errors. The end of each loop is only a
declaration, not proof. When an Agent says a task is complete, it does not mean the result actually
satisfies architectural constraints, business goals, and long-term maintenance requirements. Real
decisions still require our participation, and real delivery is still our responsibility.

If you leave it alone, your understanding will continue to degrade. The faster a loop outputs code
you did not write, the larger the gap becomes between the actual code and your final understanding.
That is understanding debt. The smoother the loop is, the faster this gap accumulates, unless you
carefully read the code generated by the loop and bring key judgments back into your own
understanding.

Comfort is the dangerous part. When a loop runs by itself, human laziness makes it easy to stop
thinking and accept all of its feedback. If you design loops with judgment, they are medicine. But
if you design loops just to avoid thinking, they become an accelerator. The same action can lead to
opposite outcomes.

So my attitude toward Loop Engineering is: we can do it, and we should do it, but we must treat it
as an engineering system.

We need scheduled systems, but we cannot care only about triggering.

We need Agent autonomy, but we cannot give up boundaries.

We need knowledge capture, but we cannot put everything into the same place.

We need parallel acceleration, but we cannot lose verification and review.

In this era, change will only get faster. We need to adapt to it. We can build loops, but we must
actually build them, not just press the start button.
