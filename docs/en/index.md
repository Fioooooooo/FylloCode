---
layout: home
title: FylloCode
markdownStyles: false

hero:
  name: FylloCode
  text: Help your Agent pick up where it left off
  tagline: FylloCode connects your local Coding Agents in one project workspace. Tasks, guidelines, decisions, and knowledge stay with the project, so you can switch Sessions or Agents without explaining the project again.
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
        <img src="/assets/diagrams/lineage.png" alt="A lineage diagram connecting Task and Chat origins to Sessions, Plans, Proposals, and commits" />
        <figcaption>Task and Chat origins converge into one trace with Plans, Proposals, and commits</figcaption>
      </figure>
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">Work lineage</span>
        <h2>Keep the full thread from task to commit</h2>
        <p>FylloCode connects Tasks, Chats, Plans, Proposals, and Commits. When you revisit a change, you can see both the result and the reasoning behind it.</p>
        <ul class="fc-key-list">
          <li><strong>Where it began</strong><span>A task or a conversation can start the thread.</span></li>
          <li><strong>How it was decided</strong><span>Discussions, Plans, and Proposals stay reviewable.</span></li>
          <li><strong>Where it landed</strong><span>The result and its commit remain on the same trace.</span></li>
        </ul>
        <div class="fc-links">
          <a class="fc-link" href="/en/docs/guide/lineage">Read the Lineage guide</a>
          <a class="fc-link" href="/en/docs/features/lineage">View Work Lineage</a>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-path-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">Work paths</span>
        <h2>Different changes take different paths</h2>
        <p>Make a clear small change directly, write a Plan when the approach needs work, and use a Proposal when the contract changes.</p>
      </div>
      <div class="fc-path-layout">
        <figure class="fc-diagram-frame">
          <img src="/assets/diagrams/three-paths.png" alt="A diagram showing one change branching into three work paths" />
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
              <p>Clarify the approach before changing code.</p>
            </div>
          </article>
          <article class="fc-path-card fc-path-card--featured">
            <span class="fc-path-card__number">03</span>
            <div>
              <h3>Proposal</h3>
              <p>Review a contract change and keep the formal basis.</p>
            </div>
          </article>
          <div class="fc-links">
            <a class="fc-link" href="/en/docs/guide/change-paths">See the three paths</a>
            <a class="fc-link" href="/en/docs/features/proposal">View Proposals</a>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-proposal-record-section">
    <div class="fc-section__inner fc-showcase fc-showcase--reverse">
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">Proposal record</span>
        <h2>Proposal keeps the background, trade-offs, and execution basis together</h2>
        <p>For changes that need review, keep not only the conclusion but also why it was chosen, how risk is controlled, and how it will land.</p>
        <div class="fc-links">
          <a class="fc-link" href="/en/docs/features/proposal">View Proposals</a>
          <a class="fc-link" href="/en/docs/guide/change-paths">See the review path</a>
        </div>
      </div>
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/proposal.png" alt="A Proposal diagram connecting background, alternatives, risks, migration, tasks, and the formal spec" />
        <figcaption>Proposal keeps background, trade-offs, risks, migration, tasks, and spec in one record</figcaption>
      </figure>
    </div>
  </section>
  <section class="fc-section fc-context-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">Project records</span>
        <h2>Every kind of project information has a place</h2>
        <p>FylloCode does not flatten everything into one memory.</p>
      </div>
      <div class="fc-context-grid">
        <article class="fc-context-card fc-context-card--lineage">
          <span class="fc-context-card__token">lineage</span>
          <h3>How the work happened</h3>
          <p>Connect tasks, conversations, plans, proposals, and commits into one trace.</p>
          <a class="fc-link fc-link--on-dark" href="/en/docs/features/lineage">View Lineage</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">guidelines</span>
          <h3>How this project works</h3>
          <p>Keep architecture, testing, and working conventions with the codebase.</p>
          <a class="fc-link" href="/en/docs/features/guidelines">View Guidelines</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">knowledge</span>
          <h3>Facts code cannot tell you</h3>
          <p>Keep important facts that cannot be inferred from the repository next time.</p>
          <a class="fc-link" href="/en/docs/features/knowledge">View Knowledge</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">specs</span>
          <h3>Formal capability boundaries</h3>
          <p>Turn confirmed behavior and contracts into project specifications.</p>
          <a class="fc-link" href="/en/docs/features/specs">View Specs</a>
        </article>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-evolution-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">Keep it current</span>
        <h2>After each change, the project is clearer</h2>
        <p>New decisions, conventions, facts, and contracts stay in the right place and remain useful for the next piece of work.</p>
      </div>
      <div class="fc-evolution-grid">
        <article class="fc-evolution-card">
          <div class="fc-evolution-copy">
            <span class="fc-context-card__token">guidelines</span>
            <h3>Conventions follow the code</h3>
            <p>Project conventions can evolve with real changes, with versioning and review boundaries intact.</p>
            <a class="fc-link" href="/en/docs/features/guidelines">Learn about Guidelines</a>
          </div>
          <figure class="fc-evolution-media">
            <img src="/assets/diagrams/guideline.png" alt="A diagram showing a code change evolving a guideline that shapes the next piece of work" />
          </figure>
        </article>
        <article class="fc-evolution-card">
          <div class="fc-evolution-copy">
            <span class="fc-context-card__token">knowledge</span>
            <h3>Facts keep their source and freshness</h3>
            <p>Important facts keep their source, are confirmed by the user, and can be checked again when they age.</p>
            <a class="fc-link" href="/en/docs/features/knowledge">Learn about Knowledge</a>
          </div>
          <figure class="fc-evolution-media">
            <img src="/assets/diagrams/knowledge.png" alt="A diagram showing important facts moving through source checks and user review into knowledge" />
          </figure>
        </article>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-settlement-section">
    <div class="fc-section__inner fc-showcase">
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/project-state.png" alt="A diagram showing Direct, Plan, and Proposal returning relevant results to project state, where Lineage, Guidelines, Knowledge, and Specs inform the next session" />
        <figcaption>Every work path returns its outputs to the project for the next session</figcaption>
      </figure>
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">Work results</span>
        <h2>When work is done, the project keeps the result</h2>
        <p>Direct, Plan, and Proposal return their relevant results to project state. Lineage, Guidelines, Specs, and Knowledge keep their respective records and continue to inform the next session, so a new conversation does not have to start from scratch.</p>
        <ul class="fc-key-list">
          <li><strong>Record</strong><span>Keep how the work happened and where it landed.</span></li>
          <li><strong>Continue</strong><span>Let the next collaboration start from the updated project state.</span></li>
        </ul>
        <div class="fc-links">
          <a class="fc-link" href="/en/docs/guide/change-paths">See the full work flow</a>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-scale-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">Start with one Project</span>
        <h2>Begin in the projects you already have</h2>
        <p>Connect local Projects, the Agents you use, and existing engineering systems in one Workspace.</p>
      </div>
      <div class="fc-scale-layout">
        <figure class="fc-diagram-frame fc-scale-diagram">
          <img src="/assets/diagrams/workspace.png" alt="A Workspace diagram connecting multiple Projects, ACP Agents, and engineering systems while preserving context boundaries" />
          <figcaption>One Workspace connects Projects, Agents, and existing systems</figcaption>
        </figure>
        <div class="fc-scale-content">
          <article>
            <h3>Open</h3>
            <p>Select a Project, or bring multiple Projects into one Workspace.</p>
            <a class="fc-link" href="/en/docs/guide/getting-started#open-project-or-workspace">Open a Project or Workspace</a>
          </article>
          <article>
            <h3>Connect</h3>
            <p>Connect an ACP Agent and the engineering systems you already use.</p>
            <div class="fc-links">
              <a class="fc-link" href="/en/docs/features/agents">View ACP Agents</a>
              <a class="fc-link" href="/en/docs/features/integrations">View Integrations</a>
            </div>
          </article>
          <article>
            <h3>Start</h3>
            <p>Create one task and complete your first work thread.</p>
            <a class="fc-link" href="/en/docs/guide/change-paths">Start your first work thread</a>
          </article>
        </div>
      </div>
    </div>
  </section>
</div>
