---
layout: home
title: FylloCode
markdownStyles: false

hero:
  name: FylloCode
  text: The team governance layer for Coding Agents
  tagline: Make every Agent follow the same evolving rules, and connect Task, Chat, Proposal, and Archive into one traceable decision path.
  image:
    src: /assets/fyllocode.svg
    alt: FylloCode
  actions:
    - theme: brand
      text: Get Started
      link: /en/docs/guide/getting-started
    - theme: alt
      text: Download Desktop App
      link: https://github.com/Fioooooooo/FylloCode/releases
    - theme: alt
      text: Learn the Workflow
      link: /en/docs/guide/workflow
---

<main class="fc-landing">
  <section class="fc-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <h2>Leave reviewable decisions before Agents write code</h2>
        <p>
          FylloCode does not replace your IDE, CI/CD, or project management system. It adds a persistent, structured, and traceable governance layer above the codebase and engineering tools your team already uses.
        </p>
      </div>
      <div class="fc-grid">
        <article class="fc-card">
          <h3>Shared Rules</h3>
          <p>Expose project-level conventions to every Agent so architecture boundaries, naming rules, and forbidden paths remain consistent across Agents and sessions.</p>
        </article>
        <article class="fc-card">
          <h3>Decision Records</h3>
          <p>Keep each proposal's context, tradeoffs, and rejected options as structured records instead of losing them inside a single chat.</p>
        </article>
        <article class="fc-card">
          <h3>End-to-End Traceability</h3>
          <p>Connect intent, discussion, implementation, review, and archive with clear artifacts so future maintainers can explain why a change happened.</p>
        </article>
        <article class="fc-card">
          <h3>Self-Evolving Rules</h3>
          <p>Turn team practices into durable project knowledge so the next Agent run starts from the latest rules.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="fc-section fc-section--tinted">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <h2>A traceable and self-improving change path</h2>
        <p>
          From Task to Chat, Proposal, and Apply &amp; Archive, every input, decision, and artifact is recorded into one lineage. The rules and knowledge that survive the task become the starting point for the next one.
        </p>
      </div>
      <div class="fc-steps">
        <article class="fc-step">
          <strong>01</strong>
          <h3>Task</h3>
          <p>The starting point of the path. Tasks can be created locally by the team or synced from connected engineering systems.</p>
        </article>
        <article class="fc-step">
          <strong>02</strong>
          <h3>Chat</h3>
          <p>Agents analyze requirements, inspect code evidence, and help the team compare tradeoffs before a decision is made.</p>
        </article>
        <article class="fc-step">
          <strong>03</strong>
          <h3>Proposal</h3>
          <p>Confirmed decisions become proposal, design, specs, and tasks so reviews have concrete artifacts and future work can trace the rationale.</p>
        </article>
        <article class="fc-step">
          <strong>04</strong>
          <h3>Apply &amp; Archive</h3>
          <p>Agents implement within the approved boundary, then archive decision context, spec updates, and guideline evolution for future tasks.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="fc-section">
    <div class="fc-section__inner fc-showcase">
      <div class="fc-split">
        <h2>From task board to proposal archive</h2>
        <p>
          The product is organized around day-to-day engineering collaboration: the task board collects entry points, the Proposal page carries review and archive, the chat panel drives Agent work, and the Workflow editor keeps the process explicit.
        </p>
        <div class="fc-links">
          <a class="fc-link" href="/en/docs/features/overview">Project Overview</a>
          <a class="fc-link" href="/en/docs/features/task">Task Board</a>
          <a class="fc-link" href="/en/docs/features/proposal">Proposal Review</a>
          <a class="fc-link" href="/en/docs/features/workflow">Workflow Orchestration</a>
        </div>
      </div>
      <figure class="fc-screenshot">
        <img src="/assets/screenshots/task.png" alt="FylloCode task board screenshot" />
      </figure>
    </div>
  </section>

  <section class="fc-section fc-section--tinted">
    <div class="fc-section__inner fc-showcase">
      <figure class="fc-screenshot">
        <img src="/assets/screenshots/acp-registry.png" alt="FylloCode ACP Agents screenshot" />
      </figure>
      <div class="fc-split">
        <h2>Connect existing Agents and engineering systems</h2>
        <p>
          FylloCode connects Coding Agents through ACP and writes task outcomes back to existing engineering systems through integration providers. Teams can keep their current toolchain while adding the governance layer Agent collaboration needs.
        </p>
        <div class="fc-links">
          <a class="fc-link" href="/en/docs/features/agents">ACP Agents</a>
          <a class="fc-link" href="/en/docs/features/integrations">Engineering Integrations</a>
          <a class="fc-link" href="/en/docs/reference/acp-agent-kind">Agent Kinds</a>
        </div>
      </div>
    </div>
  </section>
</main>
