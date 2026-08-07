---
layout: home
title: FylloCode — Coding Agent Workspace for Claude Code & Codex
titleTemplate: false
description: An open-source desktop app for Claude Code, Codex, and other local coding agents. Assign tasks, review plans, and trace every change, with conventions and findings carried over to the next agent.
markdownStyles: false

hero:
  name: FylloCode
  text: Your Agent understands your project better over time
  tagline: FylloCode is an open-source desktop app that brings Claude Code, Codex, and other local coding agents into your project workflow. Assign tasks, review plans, trace every change. The conventions and findings that accumulate carry over to the next agent.
  image:
    src: /assets/fyllocode.svg
    alt: FylloCode logo
  actions:
    - theme: brand
      text: Get Started
      link: /en/docs/guide/getting-started
    - theme: alt
      text: See How It Works
      link: /en/docs/guide/change-paths
    - theme: alt
      text: Download the App
      link: https://github.com/Fioooooooo/FylloCode/releases
---

<div class="fc-landing">
  <section class="fc-agent-strip" aria-label="Agent connections">
    <div class="fc-agent-strip__inner">
      <div class="fc-agent-strip__row">
        <p class="fc-agent-strip__label">Connect your Agents</p>
        <ul class="fc-agent-strip__list">
          <li class="fc-agent-strip__item">
            <img class="fc-agent-strip__icon" src="/assets/agents/claude-code.svg" alt="" aria-hidden="true" />
            <span>Claude Code</span>
          </li>
          <li class="fc-agent-strip__item">
            <img class="fc-agent-strip__icon" src="/assets/agents/codex.svg" alt="" aria-hidden="true" />
            <span>Codex</span>
          </li>
          <li class="fc-agent-strip__item">
            <img class="fc-agent-strip__icon" src="/assets/agents/gemini-cli.svg" alt="" aria-hidden="true" />
            <span>Gemini CLI</span>
          </li>
          <li class="fc-agent-strip__item">
            <img class="fc-agent-strip__icon" src="/assets/agents/cursor.svg" alt="" aria-hidden="true" />
            <span>Cursor</span>
          </li>
          <li class="fc-agent-strip__item">
            <img class="fc-agent-strip__icon" src="/assets/agents/pi.svg" alt="" aria-hidden="true" />
            <span>Pi</span>
          </li>
          <li class="fc-agent-strip__item">
            <img class="fc-agent-strip__icon" src="/assets/agents/opencode.svg" alt="" aria-hidden="true" />
            <span>OpenCode</span>
          </li>
          <li class="fc-agent-strip__item">
            <img class="fc-agent-strip__icon" src="/assets/agents/kimi-cli.svg" alt="" aria-hidden="true" />
            <span>Kimi Code</span>
          </li>
          <li class="fc-agent-strip__item">
            <img class="fc-agent-strip__icon" src="/assets/agents/qwen-code.svg" alt="" aria-hidden="true" />
            <span>Qwen Code</span>
          </li>
        </ul>
      </div>
      <p class="fc-agent-strip__note">Connect any ACP-compatible Agent.</p>
    </div>
  </section>
  <section class="fc-section fc-lineage-section">
    <div class="fc-section__inner fc-showcase">
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/lineage.png" alt="A lineage diagram connecting Task and Chat origins to Sessions, Plans, Proposals, and commits" loading="lazy" />
        <figcaption>Task and Chat origins converge into one trace with Plans, Proposals, and commits</figcaption>
      </figure>
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">Work lineage</span>
        <h2>Three months later, you can still explain why this line changed</h2>
        <p>One Agent run can touch a hundred files, and <code>git blame</code> only tells you who committed them. FylloCode connects tasks, chats, Plans, Proposals, and commits into one line. The next person to touch this code does not have to reconstruct the reasoning from scratch.</p>
        <ul class="fc-key-list">
          <li><strong>Where it starts</strong><span>A task, or a conversation you opened on the spot.</span></li>
          <li><strong>What backs it</strong><span>How the discussion converged, which approach won, what got ruled out.</span></li>
          <li><strong>Where it lands</strong><span>The implementation and its commit, still on the same line.</span></li>
        </ul>
        <div class="fc-links">
          <a class="fc-link" href="/en/docs/guide/lineage">Read the Lineage guide</a>
          <a class="fc-link" href="/en/docs/features/lineage">View Work Lineage</a>
          <a class="fc-link" href="/en/blog/2026-06-19-design-of-lineage">How Lineage is designed</a>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-path-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">Work paths</span>
        <h2>A copy tweak should not need a full review</h2>
        <p>If the scope is obvious, make the change. If you need to think it through, write a Plan. If it touches a public API, a schema, or user-visible behavior, that is a Proposal.</p>
      </div>
      <div class="fc-path-layout">
        <figure class="fc-diagram-frame">
          <img src="/assets/diagrams/three-paths.png" alt="A diagram showing one change branching into three work paths" loading="lazy" />
          <figcaption>One change branches into three work paths</figcaption>
        </figure>
        <div class="fc-path-grid">
          <article class="fc-path-card">
            <span class="fc-path-card__number">01</span>
            <div>
              <h3>Direct</h3>
              <p>Scope is clear. Make the change.</p>
            </div>
          </article>
          <article class="fc-path-card">
            <span class="fc-path-card__number">02</span>
            <div>
              <h3>Plan</h3>
              <p>Write down the approach and the trade-offs first.</p>
            </div>
          </article>
          <article class="fc-path-card fc-path-card--featured">
            <span class="fc-path-card__number">03</span>
            <div>
              <h3>Proposal</h3>
              <p>The contract changes, so leave something reviewable behind.</p>
            </div>
          </article>
          <div class="fc-links">
            <a class="fc-link" href="/en/docs/guide/change-paths">See the three paths</a>
            <a class="fc-link" href="/en/docs/features/proposal">View Proposals</a>
            <a class="fc-link" href="/en/blog/2026-06-25-plan-and-sdd-agent-workflow-triage">Why triage at all</a>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-proposal-record-section">
    <div class="fc-section__inner fc-showcase fc-showcase--reverse">
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">Proposal record</span>
        <h2>A Proposal holds more than the conclusion</h2>
        <p>Why this path, what was ruled out, how the risk is contained, how it migrates, how it splits into tasks — all in one record. On archive, the specs this change touches are updated along with it.</p>
        <div class="fc-links">
          <a class="fc-link" href="/en/docs/features/proposal">View Proposals</a>
          <a class="fc-link" href="/en/docs/guide/change-paths">See the review path</a>
        </div>
      </div>
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/proposal.png" alt="A Proposal diagram connecting background, alternatives, risks, migration, tasks, and the formal spec" loading="lazy" />
        <figcaption>Proposal keeps background, trade-offs, risks, migration, tasks, and spec in one record</figcaption>
      </figure>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-context-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">Project records</span>
        <h2>Your Agent's four kinds of memory, read on demand</h2>
        <p>Pack decisions, conventions, facts, and contracts into one memory and they just get in each other's way. FylloCode stores each kind separately, so the Agent reads only the part that bears on the work in front of it instead of loading everything into context.</p>
      </div>
      <div class="fc-context-grid">
        <article class="fc-context-card fc-context-card--lineage">
          <span class="fc-context-card__token">lineage</span>
          <h3>How this change happened</h3>
          <p>Tasks, chats, Plans, Proposals, and commits on one line.</p>
          <a class="fc-link fc-link--on-dark" href="/en/docs/features/lineage">View Lineage</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">guidelines</span>
          <h3>How this project is built</h3>
          <p>Architecture boundaries, testing rules, working conventions — committed with the code.</p>
          <a class="fc-link" href="/en/docs/features/guidelines">View Guidelines</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">knowledge</span>
          <h3>Facts the code will not tell you</h3>
          <p>The conclusion that took two hours to reach, and the background only you have.</p>
          <a class="fc-link" href="/en/docs/features/knowledge">View Knowledge</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">specs</span>
          <h3>Contracts already settled</h3>
          <p>Generated when a Proposal is archived. The project's formal behavior boundary.</p>
          <a class="fc-link" href="/en/docs/features/specs">View Specs</a>
        </article>
      </div>
    </div>
  </section>
  <section class="fc-section fc-settlement-section">
    <div class="fc-section__inner fc-showcase">
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/project-state.png" alt="A diagram showing Direct, Plan, and Proposal returning relevant results to project state, where Lineage, Guidelines, Knowledge, and Specs inform the next session" loading="lazy" />
        <figcaption>Every work path returns its outputs to the project for the next session</figcaption>
      </figure>
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">Capture and reuse</span>
        <h2>You never have to ask. The Agent knows what is worth keeping.</h2>
        <p>When an ordinary Agent session ends, the useful parts are left scattered through the chat log.</p>
        <ul class="fc-key-list">
          <li><strong>It proposes</strong><span>A counterintuitive finding, an investigation that cost more than its answer — flagged at fixed checkpoints.</span></li>
          <li><strong>You confirm</strong><span>Flagging does not interrupt the discussion; it is written back only once you approve.</span></li>
          <li><strong>Next time it is there</strong><span>A new session starts with the guideline index and knowledge already injected.</span></li>
        </ul>
        <div class="fc-links">
          <a class="fc-link" href="/en/docs/features/knowledge">View Knowledge</a>
          <a class="fc-link" href="/en/docs/features/guidelines">View Guidelines</a>
          <a class="fc-link" href="/en/blog/2026-07-15-durable-knowledge">How capture works</a>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-scale-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">Start with one Project</span>
        <h2>Start in the projects you already have</h2>
        <p>No migration required, and the Agent you use today plugs straight into FylloCode. Open a local repository, or put several into one Workspace.</p>
      </div>
      <div class="fc-scale-layout">
        <figure class="fc-diagram-frame fc-scale-diagram">
          <img src="/assets/diagrams/workspace.png" alt="A Workspace diagram connecting multiple Projects, ACP Agents, and engineering systems while preserving context boundaries" loading="lazy" />
          <figcaption>One Workspace connects Projects, Agents, and existing systems</figcaption>
        </figure>
        <div class="fc-scale-content">
          <article>
            <h3>Open</h3>
            <p>Pick a local repository as a Project, or bring several Projects into one Workspace.</p>
            <a class="fc-link" href="/en/docs/guide/getting-started#open-project-or-workspace">Open a Project or Workspace</a>
          </article>
          <article>
            <h3>Connect</h3>
            <p>Connect the ACP Agent you already use, along with the engineering systems you already run.</p>
            <div class="fc-links">
              <a class="fc-link" href="/en/docs/features/agents">View ACP Agents</a>
              <a class="fc-link" href="/en/docs/features/integrations">View Integrations</a>
            </div>
          </article>
          <article>
            <h3>Start</h3>
            <p>Create a task and run your first work thread end to end.</p>
            <a class="fc-link" href="/en/docs/guide/change-paths">Start your first work thread</a>
          </article>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-cta-section">
    <div class="fc-section__inner fc-cta">
      <span class="fc-eyebrow">Get started</span>
      <h2>Start building the record with today's work</h2>
      <p>No extra time set aside for housekeeping. Work the way you already do, and FylloCode makes the project state progressively clearer.</p>
      <div class="fc-cta__actions">
        <a class="fc-btn fc-btn--brand" href="https://github.com/Fioooooooo/FylloCode/releases">Download the App</a>
        <a class="fc-btn" href="/en/docs/guide/getting-started">Read the Quickstart</a>
      </div>
      <ul class="fc-trust">
        <li>MIT licensed</li>
        <li>Free to use</li>
        <li>Your data stays local</li>
      </ul>
      <ul class="fc-platforms">
        <li class="fc-platform">
          <strong>macOS</strong>
          <span>Apple Silicon / Intel</span>
        </li>
        <li class="fc-platform">
          <strong>Windows</strong>
          <span>x64 installer</span>
        </li>
        <li class="fc-platform">
          <strong>Linux</strong>
          <span>AppImage / deb (x64)</span>
        </li>
      </ul>
    </div>
  </section>
</div>
