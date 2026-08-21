---
name: product-writing
description: Write or edit evidence-based, human-sounding English and Chinese copy for FylloCode feature launches, product and technical documentation, blogs, marketing, in-product UI, and internal communication. Use for drafting, rewriting, reviewing, and localization; do not use to evade AI-content detectors or for grammar-only proofreading.
---

# Product Writing

Turn product facts into natural, actionable writing for a specific reader. The goal is not to make AI assistance undetectable. It is to prevent unsupported certainty, formulaic structure, empty language, and writing without a recognizable authorial voice.

## Before Writing

1. Read the repository `AGENTS.md`, inspect `git status --short`, and read the project guidance that applies to the deliverable. For product documentation, read the relevant documentation architecture and style guidance. Ground feature descriptions in merged code, approved specifications, designs, and tests.
2. Establish the deliverable, target reader, reader task, publication channel, language, length, and desired action. Do not make one generic piece of writing serve incompatible audiences.
3. Gather source material: behavior, prerequisites, limitations, compatibility, risks, data, examples, customer language, established terminology, and release dates. Keep confirmed facts, plans, and assumptions distinct.
4. When useful examples of comparable work or brand voice exist, read a small representative sample. Derive voice decisions from it; do not imitate living authors or copy incidental phrasing into a new context.

When essential information is missing, list concise questions or use explicit placeholders. Never invent capabilities, data, customer feedback, quotations, compatibility, release dates, personal experiences, or conclusions.

## Select a Mode

- **Draft from scratch**: establish the information structure and factual gaps first. Draft short text directly; propose an outline for long or high-risk content.
- **Edit existing copy**: diagnose the most consequential one to three AI-writing signals before choosing a light edit or restructuring. Do not mechanically replace words.
- **Review**: preserve intended meaning and give actionable feedback on facts, reader task, specificity, structure, voice, and actionability.
- **Localize**: preserve intent, terminology, and product facts while writing naturally in the target language. Do not translate sentence by sentence or distort risk disclosure between languages.

For substantive drafting or rewriting, read [ai-writing-signals.md](references/ai-writing-signals.md). Then read the relevant section of [scenario-guides.md](references/scenario-guides.md). Read [source-material-and-voice.md](references/source-material-and-voice.md) when establishing or maintaining voice, terminology, and evidence boundaries. Read [review-workflow.md](references/review-workflow.md) when editing or conducting a final review.

## Core Judgment

Treat AI-writing patterns as signals, not word-list matches. A word, em dash, or sentence pattern warrants revision only when it fails to carry necessary information, conflicts with the established voice, or clusters in the text.

Prioritize revisions in this order:

1. Add or verify facts, context, limits, and reader actions.
2. Restructure information around reader questions.
3. Remove repetition, empty language, and sentences that do not advance the content.
4. Adjust syntax, punctuation, and vocabulary last.

Every meaningful claim should answer at least one of these questions: who is affected, what changes, under what conditions, why it matters, how to start, or how to recover. Narrow, qualify, or remove strong claims that lack evidence.

## Delivering the Work

- When the user needs publishable copy, lead with the draft and list only factual gaps that affect correctness.
- When co-authoring long content or a launch package, provide an outline, source-material needs, and deliverable list before drafting once the facts are available.
- When reviewing, use `Issue → Why it matters → Suggested change`. For a revised draft, explain only the changes with material impact.
- Preserve commands, paths, API names, versions, product terms, and necessary risk disclosures. Never trade their meaning for smoother prose.

## Final Check

Confirm that the text:

- does not present unconfirmed items as established facts;
- lets the reader understand a next step, or a limitation and its scope;
- adds a fact, evidence, judgment, condition, or action in every paragraph rather than restating prior text;
- uses a voice appropriate to the product and channel instead of generic corporate prose; and
- keeps feature scope, limits, terminology, and required actions equivalent across Chinese and English versions.
