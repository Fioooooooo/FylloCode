# FylloCode Documentation Architecture and Style

Use this reference whenever release work creates, restructures, or substantially rewrites FylloCode product documentation. Treat the documentation as a team playbook plus an exact product reference, not as a marketing site or a tour of interface controls.

## Contents

- [Core principles](#core-principles)
- [Audience paths](#audience-paths)
- [Information architecture](#information-architecture)
- [Content types](#content-types)
- [Page templates](#page-templates)
- [Voice and wording](#voice-and-wording)
- [FylloCode terminology](#fyllocode-terminology)
- [Procedures, links, and visuals](#procedures-links-and-visuals)
- [Bilingual documentation](#bilingual-documentation)
- [FylloCode examples](#fyllocode-examples)
- [Release audit application](#release-audit-application)

## Core Principles

- Give each page one primary reader intent. Do not mix tutorial, task guidance, explanation, and exhaustive reference without a clear reason.
- Organize learning and task content around what a product or engineering team needs to achieve, not around which button or component implements it.
- Organize reference content around the stable structure of the product, configuration, API, or data contract it describes.
- Help readers answer, in order: why this matters, when to use it, what to do, how to verify success, and what can go wrong.
- Prefer a small set of accurate, high-value pages over exhaustive low-value feature coverage.
- Describe shipped behavior only. Do not document proposals, implementation intent, or future promises as current behavior.
- Treat written text as authoritative. Use screenshots and videos only as supporting material; the task must remain understandable without them.

## Audience Paths

Make the documentation landing page and section indexes serve these distinct readers:

| Audience                                                           | Primary questions                                                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Product or engineering leader evaluating FylloCode                 | Why is it needed, which teams benefit, what changes operationally, and what are its data and security boundaries?       |
| Team lead or process owner                                         | How do we adopt it in an existing repository, define governance, choose workflows, and make team behavior consistent?   |
| Product manager, developer, designer, or reviewer doing daily work | How do I take a change from Task through Chat, Proposal, Apply, and Archive, and how do I recover when the path breaks? |
| Platform owner or integration engineer                             | How do Agents, MCP servers, provider integrations, configuration, storage, compatibility, and troubleshooting work?     |
| Repository contributor                                             | How do I build, test, change, and contribute to FylloCode itself without violating project conventions?                 |

Do not assume every reader is a developer. State the intended reader when permissions, responsibilities, or technical depth matter.

## Information Architecture

Use this target hierarchy when deciding where durable content belongs. Preserve established URLs unless the task explicitly includes a documentation restructure.

```text
Documentation
├── Understand FylloCode
│   ├── Why FylloCode exists
│   ├── Teams and situations it fits
│   ├── Core mental model
│   └── Data, security, and runtime boundaries
├── Get started
│   └── Complete the first governed code change
├── Team guides
│   ├── Adopt FylloCode in an existing repository
│   ├── Choose Direct, Plan, or Proposal
│   ├── Review and apply a Proposal
│   ├── Establish and maintain Guidelines
│   ├── Configure Agents and engineering integrations
│   ├── Define a reusable team Workflow
│   └── Prepare and publish a release
├── Product reference
│   ├── Overview
│   ├── Task
│   ├── Chat
│   ├── Proposal
│   ├── Workflow
│   ├── Knowledge and lineage
│   └── Settings
├── Technical reference
│   ├── Workflow YAML
│   ├── fyllo-specs
│   ├── fyllo-cortex
│   ├── ACP Agent kinds
│   └── Data formats and compatibility
├── Operations and troubleshooting
│   ├── Data backup and migration
│   ├── Interrupted Apply recovery
│   ├── Agent and MCP connection failures
│   └── Common errors
└── Contributing
```

Keep blogs separate. A blog can explain history, research, or an opinion, but it must not be the only durable description of current product behavior.

## Content Types

Choose the content type before writing:

| Type                           | Reader intent                                        | Organize by                     | Writing focus                                                                  |
| ------------------------------ | ---------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| Explanation                    | Understand why the product or concept works this way | Mental models and trade-offs    | Context, reasoning, boundaries, and relationships                              |
| Tutorial or quickstart         | Learn through one controlled successful experience   | A complete learning path        | Concrete steps, expected results, and minimal branching                        |
| How-to or team guide           | Complete a real task in current work                 | User goal or problem            | Action sequence, decisions, verification, and recovery                         |
| Product reference              | Look up a product surface or state                   | Stable product structure        | Exact capabilities, states, defaults, limitations, and examples                |
| Technical reference            | Look up configuration, tool, API, or format facts    | Machinery or contract structure | Types, fields, syntax, defaults, errors, versions, and compatibility           |
| Operations and troubleshooting | Diagnose, recover, migrate, or maintain              | Symptom or operational outcome  | Cause, diagnosis, safe action, verification, rollback, and escalation evidence |
| Contributing                   | Change FylloCode itself safely                       | Repository workflow             | Environment, architecture boundaries, commands, checks, and submission rules   |

Feature pages are product reference unless they guide a real cross-feature task. Do not use a repeated “Main capabilities” inventory as a substitute for team guides.

## Page Templates

### Explanation

1. State the concept and why it matters in the opening paragraph.
2. Name the problem it addresses.
3. Describe the mental model and relationships.
4. Explain important trade-offs and boundaries.
5. Link to a concrete tutorial, guide, or reference as the next step.

### Tutorial or Quickstart

1. State the successful outcome and approximate scope.
2. List prerequisites and the known starting state.
3. Lead the reader through one numbered end-to-end path.
4. Show expected results at meaningful checkpoints.
5. End with a verification step and a small set of next actions.
6. Keep alternatives and deep explanation out of the main flow; link to them.

### How-to or Team Guide

1. Use a title that states the goal, such as “Prepare and publish a release.”
2. State when to use the guide and who is responsible.
3. List prerequisites, permissions, risks, and assumptions.
4. Give a logical sequence of actions and decision branches.
5. Explain how to verify the result.
6. Include recovery or rollback when the task can fail or cause durable changes.
7. Link to the authoritative reference instead of embedding every possible option.

### Product or Technical Reference

1. Define the capability, surface, tool, or format precisely.
2. State where it is available and any role or version requirement.
3. Describe fields, parameters, states, defaults, errors, storage, or compatibility in a consistent order.
4. Provide minimal examples that illustrate usage without turning the page into a tutorial.
5. Link to task guides for complete workflows.

### Troubleshooting

1. Use the visible symptom as the title or entry point.
2. List likely causes in diagnostic order.
3. Provide safe checks before corrective actions.
4. Give the fix and expected result.
5. Explain how to verify recovery and what evidence to collect if escalation is needed.

## Voice and Wording

Write in a direct, calm, precise, and confident voice. Address the reader as “you” in English. In Chinese instructions, normally omit the pronoun and use an imperative verb.

| Intent                      | Preferred pattern                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Reader action               | “Open the Proposal details and review Design and Tasks.” / “打开 Proposal 详情，检查 Design 和 Tasks。” |
| System behavior             | “After archive succeeds, FylloCode merges the capability delta into the active specs.”                  |
| Hard prerequisite           | “You must approve the Proposal before starting Apply.”                                                  |
| Recommendation              | “Use the packaged app for Apply because development hot reload can interrupt the workflow.”             |
| Default                     | “By default, the proposal uses a linked worktree.”                                                      |
| Conditional behavior        | “If the change alters a public contract, create a Proposal.”                                            |
| Explicit guarantee or limit | “Closing the window does not delete project data.”                                                      |

Apply these rules:

- Use active voice and identify the actor. Distinguish what the reader does from what FylloCode or an Agent does.
- Begin with the outcome or task, not a feature slogan.
- Use `must` or “必须” only for a real prerequisite or invariant. Use `recommend` or “建议” for advice and state the reason.
- Use `by default`, `only`, `does not`, and `if ... then ...` to make boundaries explicit.
- Reserve uppercase normative words such as `MUST` and `SHALL` for specs and guidelines; use plain language in product documentation.
- Reproduce visible UI labels exactly. Use the same capitalization and terminology as the product.
- Define specialized terms on first use and use one term consistently afterward.
- Avoid unprovable marketing words such as powerful, flexible, intelligent, effortless, simple, obvious, or significantly improved.
- Do not say the product “automatically handles” something without naming the trigger, scope, result, and relevant failure behavior.
- Avoid regional idioms, jokes, slang, and metaphors that make translation or accessibility harder.
- Do not call the reader “the user” when speaking directly to them. Use “user” only for another person whose software use the reader is managing or designing.
- Do not hide errors, destructive effects, compatibility limits, or required permissions in notes after the procedure.

## FylloCode Terminology

- Preserve product stage names as `Task`, `Chat`, `Plan`, `Proposal`, `Apply`, and `Archive`. Explain each on first use instead of inventing localized synonyms.
- Use `Apply & Archive` when referring to the combined product stage, and `Apply` or `Archive` when referring to the individual operation.
- Use `lineage` for the trace that connects intent, conversations, proposals, implementation, and archived outcomes. Define `subject` when discussing one lineage record.
- Use `guidelines` for repository engineering conventions, `specs` for active behavior contracts, and `knowledge` for durable project findings. Do not collapse them into the generic word “documentation.”
- Preserve `Agent`, `ACP`, `MCP`, OpenSpec, tool names, configuration keys, paths, and action names exactly. Define acronyms on first use for non-specialist readers.
- Use code formatting for commands, file paths, configuration keys, channels, API shapes, and literal state values. Do not use code formatting merely for emphasis.
- Keep stable product terms aligned across Chinese and English pages even when the surrounding sentence is localized naturally.

## Procedures, Links, and Visuals

- Use numbered lists for sequential procedures. Give each step a concrete action.
- Put prerequisites and required permissions before the procedure, not halfway through it.
- Explain the expected result after a step when the next action depends on that result.
- Show commands without a shell prompt so they remain easy to copy. Use descriptive uppercase placeholders such as `PROJECT-PATH` and explain how to replace them.
- Place warnings before destructive or irreversible steps.
- Use descriptive link text and include only links that help complete the task, diagnose a problem, or choose the next step.
- Put optional further reading at the end rather than interrupting the main procedure.
- Use diagrams for ownership, state transitions, or multi-stage flows. Use screenshots only when spatial UI recognition materially reduces effort.
- Update a screenshot when it would mislead the reader about navigation, available actions, or state. Do not update it solely for harmless visual polish.

## Bilingual Documentation

- Treat Chinese and English as one deliverable for product documentation intended for both locales.
- Preserve the same facts, headings, task coverage, commands, defaults, warnings, limitations, and compatibility notes.
- Translate meaning and reader intent, not sentence structure. English must read naturally; Chinese must not read like an internal implementation note.
- Keep product names, state values, commands, paths, and configuration literals identical.
- Do not let either language contain extra shipped claims or omit a risk disclosed by the other.
- Update indexes, navigation metadata, and cross-links in both locales when adding paired pages.

## FylloCode Examples

Avoid a feature-centered claim:

> FylloCode provides a powerful and flexible Workflow feature that lets users configure multiple stages.

Prefer an outcome-centered explanation:

> Use Workflow to save an agreed team process as a YAML template. When the team runs the same type of work again, FylloCode uses the template's stage order, Agent assignments, and failure policy.

Avoid a vague automation claim:

> The system automatically maintains lineage.

Prefer explicit trigger and result:

> When Chat starts from a Task, FylloCode records later Proposal, Apply, and Archive activity on the same lineage subject. When Chat starts without a Task, the subject keeps `chat` as its origin even if a Task is added later.

Avoid a control-tour instruction:

> Open the Proposal page to view proposals.

Prefer a task and decision:

> To confirm scope and acceptance criteria before implementation, open the Proposal details and review Proposal, Design, Specs, and Tasks. Start Apply only after the review is approved.

## Release Audit Application

For every user-visible release change, inspect both sides of the documentation system:

1. **Task guidance:** Can the intended reader accomplish the new or changed team outcome?
2. **Reference truth:** Can the reader look up the exact capability, state, default, error, configuration, or compatibility boundary?

Create or update both when the change affects both. A changelog bullet never substitutes for durable task guidance or reference material.

Before marking documentation complete, verify:

- the page has one clear reader intent and the correct content type;
- its location matches the information architecture and it is discoverable from an index or related page;
- the opening states the outcome, audience, or concept without marketing filler;
- actions, system behavior, prerequisites, defaults, errors, and limits are explicit;
- FylloCode terminology and visible UI labels are exact;
- Chinese and English content are semantically aligned;
- screenshots, diagrams, commands, links, versions, and examples remain accurate;
- all claims describe shipped behavior and can be traced to code, tests, or active specs.
