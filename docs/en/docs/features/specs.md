---
sidebar:
  group: Product Features
  order: 67
---

# Specs

The Specs page lets you browse the current project's OpenSpec capability specs (`spec.md` files under `openspec/specs/`). The page is read-only; spec content is synced automatically when a [Proposal](/en/docs/features/proposal) is archived.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/specs.png" alt="Specs page screenshot" />
</figure>

## What specs are

A spec describes the requirements and acceptance scenarios for one capability of the project. It's the formal contract that comes out of a Proposal that took the [OpenSpec path](/en/docs/guide/workflow#proposal). When a Proposal is archived, the capability changes it contains merge into the corresponding spec file and become part of the project's specs — not every change produces a new spec, only Proposal-path changes that touch requirements or contracts do.

## Page layout

The left panel lists every spec in the project, showing the capability ID and a Purpose summary. The right panel shows the selected spec's full list of requirements, each expanding into its acceptance scenarios, with anchor navigation to jump to a specific requirement in a long document.

## Relationship to Proposal

A spec is the result of a Proposal that has been reviewed and archived — not a draft from the review itself. Spec changes under review appear in the Specs tab on the Proposal detail page, while related design and execution breakdowns live in the Design and Tasks tabs. Only after archiving are those spec deltas merged and reflected here. To find out what a capability's current formal contract is, check this page rather than a historical Proposal.
