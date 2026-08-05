---
layout: home
title: FylloCode
markdownStyles: false

hero:
  name: FylloCode
  text: 让 Agent 不必每次从零了解项目
  tagline: FylloCode 是一个连接本地 Coding Agent 的项目工作台，把任务、规范、决策和知识留在项目里。切换会话或更换 Agent 时，直接从项目最新状态继续，不必重新解释项目背景。
  image:
    src: /assets/fyllocode.svg
    alt: FylloCode 标志
  actions:
    - theme: brand
      text: 快速开始
      link: /docs/guide/getting-started
    - theme: alt
      text: 了解工作方式
      link: /docs/guide/change-paths
    - theme: alt
      text: 下载桌面端
      link: https://github.com/Fioooooooo/FylloCode/releases
---

<div class="fc-landing">
  <section class="fc-agent-strip" aria-label="Agent 接入">
    <div class="fc-agent-strip__inner">
      <div class="fc-agent-strip__row">
        <p class="fc-agent-strip__label">连接你的 Agent</p>
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
      <p class="fc-agent-strip__note">可接入任意支持 ACP 的 Agent</p>
    </div>
  </section>
  <section class="fc-section fc-lineage-section">
    <div class="fc-section__inner fc-showcase">
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/lineage.png" alt="任务和对话汇入会话，再连接方案、提案与提交的工作脉络图" />
        <figcaption>任务和对话汇入同一条脉络，再连接方案、提案与提交</figcaption>
      </figure>
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">工作脉络</span>
        <h2>从任务到提交，整条工作脉络都留得下来</h2>
        <p>FylloCode 把任务、对话、方案、提案和提交串起来。回看一项改动时，既能看到结果，也能找到它的来处和依据。</p>
        <ul class="fc-key-list">
          <li><strong>从哪里开始</strong><span>任务或对话都能成为一条工作的起点。</span></li>
          <li><strong>怎么决定</strong><span>讨论、方案和提案都能回看。</span></li>
          <li><strong>落到哪里</strong><span>最终结果和提交继续留在同一条脉络。</span></li>
        </ul>
        <div class="fc-links">
          <a class="fc-link" href="/docs/guide/lineage">阅读工作脉络指南</a>
          <a class="fc-link" href="/docs/features/lineage">查看工作脉络</a>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-path-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">工作路径</span>
        <h2>不同的改动，走不同的路</h2>
        <p>简单改动直接做，需要梳理先写方案，改变契约再进入提案。</p>
      </div>
      <div class="fc-path-layout">
        <figure class="fc-diagram-frame">
          <img src="/assets/diagrams/three-paths.png" alt="一次改动根据性质分流到三条工作路径的图" />
          <figcaption>一次改动根据性质分流到三条工作路径</figcaption>
        </figure>
        <div class="fc-path-grid">
          <article class="fc-path-card">
            <span class="fc-path-card__number">01</span>
            <div>
              <h3>直接实现</h3>
              <p>范围清楚，直接完成。</p>
            </div>
          </article>
          <article class="fc-path-card">
            <span class="fc-path-card__number">02</span>
            <div>
              <h3>方案</h3>
              <p>先理清方案，再开始改。</p>
            </div>
          </article>
          <article class="fc-path-card fc-path-card--featured">
            <span class="fc-path-card__number">03</span>
            <div>
              <h3>提案</h3>
              <p>评审契约变化，留下正式依据。</p>
            </div>
          </article>
          <div class="fc-links">
            <a class="fc-link" href="/docs/guide/change-paths">了解三线工作方式</a>
            <a class="fc-link" href="/docs/features/proposal">查看提案</a>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-proposal-record-section">
    <div class="fc-section__inner fc-showcase fc-showcase--reverse">
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">提案记录</span>
        <h2>提案把背景、取舍和执行依据放在一起</h2>
        <p>需要评审的改动，不只留下结论，也保留为什么选择它、如何控制风险，以及最后如何落地。</p>
        <div class="fc-links">
          <a class="fc-link" href="/docs/features/proposal">查看提案</a>
          <a class="fc-link" href="/docs/guide/change-paths">了解评审流程</a>
        </div>
      </div>
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/proposal.png" alt="提案将背景、方案取舍、风险、迁移、任务和能力规约连接成决策记录的图" />
        <figcaption>提案把背景、取舍、风险、迁移、任务和规约放在同一份记录里</figcaption>
      </figure>
    </div>
  </section>
  <section class="fc-section fc-context-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">项目资料</span>
        <h2>项目里的信息，各有自己的位置</h2>
        <p>FylloCode 不把所有内容混在一份记忆里。</p>
      </div>
      <div class="fc-context-grid">
        <article class="fc-context-card fc-context-card--lineage">
          <span class="fc-context-card__token">工作脉络</span>
          <h3>记录这项工作如何发生</h3>
          <p>把任务、对话、方案和提交串成一条可回看的脉络。</p>
          <a class="fc-link fc-link--on-dark" href="/docs/features/lineage">查看工作脉络</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">项目准则</span>
          <h3>记录项目应该怎么做</h3>
          <p>把架构、测试和工作约定放回代码库。</p>
          <a class="fc-link" href="/docs/features/guidelines">查看项目准则</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">知识</span>
          <h3>记录代码之外的重要事实</h3>
          <p>保存代码里推不出来、但下次工作仍然重要的内容。</p>
          <a class="fc-link" href="/docs/features/knowledge">查看知识沉淀</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">能力规约</span>
          <h3>记录正式的能力边界</h3>
          <p>把已经确认的行为和契约写成项目规约。</p>
          <a class="fc-link" href="/docs/features/specs">查看能力规约</a>
        </article>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-evolution-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">持续沉淀</span>
        <h2>每做完一项工作，项目也会更清楚</h2>
        <p>新的决策、约定、事实和契约在合适的位置留下来，并继续影响下一次工作。</p>
      </div>
      <div class="fc-evolution-grid">
        <article class="fc-evolution-card">
          <div class="fc-evolution-copy">
            <span class="fc-context-card__token">项目准则</span>
            <h3>约定跟着代码变化</h3>
            <p>项目约定随真实变更更新，保留版本和审阅边界。</p>
            <a class="fc-link" href="/docs/features/guidelines">了解项目准则演进</a>
          </div>
          <figure class="fc-evolution-media">
            <img src="/assets/diagrams/guideline.png" alt="代码变更推动项目准则演进并影响下一次工作" />
          </figure>
        </article>
        <article class="fc-evolution-card">
          <div class="fc-evolution-copy">
            <span class="fc-context-card__token">知识</span>
            <h3>事实留下来源和新鲜度</h3>
            <p>重要事实先标记来源，再由用户确认是否沉淀，过期时可以重新核查。</p>
            <a class="fc-link" href="/docs/features/knowledge">了解透明沉淀</a>
          </div>
          <figure class="fc-evolution-media">
            <img src="/assets/diagrams/knowledge.png" alt="重要事实经过来源检查和用户审阅后沉淀为知识" />
          </figure>
        </article>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-settlement-section">
    <div class="fc-section__inner fc-showcase">
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/project-state.png" alt="三条工作路径将相关结果回流到项目状态，并由工作脉络、项目准则、知识和能力规约共同影响下一次会话的图" />
        <figcaption>每一条工作路径都会把产出结果回流到项目，供下一次会话继续使用</figcaption>
      </figure>
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">工作结果</span>
        <h2>一次工作完成，结果会回流到项目里</h2>
        <p>Direct、Plan 和 Proposal 会把各自相关的结果回流到项目状态。工作脉络、项目准则、能力规约和知识并列留下对应内容，继续影响下一次工作，新对话不用从头开始。</p>
        <ul class="fc-key-list">
          <li><strong>记录</strong><span>保留这次工作如何发生，以及最终落在哪里。</span></li>
          <li><strong>继续</strong><span>让下一次协作从已经更新的项目状态开始。</span></li>
        </ul>
        <div class="fc-links">
          <a class="fc-link" href="/docs/guide/change-paths">了解完整工作流程</a>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-scale-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">从一个项目开始</span>
        <h2>在熟悉的项目里开始</h2>
        <p>连接本地项目、常用 Agent 和既有研发系统，在一个工作区中继续已有工作方式。</p>
      </div>
      <div class="fc-scale-layout">
        <figure class="fc-diagram-frame fc-scale-diagram">
          <img src="/assets/diagrams/workspace.png" alt="工作区连接多个项目、Agent 客户端和研发系统，同时保留上下文边界的图" />
          <figcaption>一个工作区，连接多个项目、Agent 和既有系统</figcaption>
        </figure>
        <div class="fc-scale-content">
          <article>
            <h3>打开</h3>
            <p>选择一个项目，也可以把多个项目放入工作区。</p>
            <a class="fc-link" href="/docs/guide/getting-started#打开-project-或-workspace">打开项目或工作区</a>
          </article>
          <article>
            <h3>连接</h3>
            <p>接入支持 ACP 的 Agent 和现有研发系统。</p>
            <div class="fc-links">
              <a class="fc-link" href="/docs/features/agents">查看 Agent</a>
              <a class="fc-link" href="/docs/features/integrations">查看研发系统集成</a>
            </div>
          </article>
          <article>
            <h3>开始</h3>
            <p>创建一项任务，完成第一条工作脉络。</p>
            <a class="fc-link" href="/docs/guide/change-paths">开始第一条工作主线</a>
          </article>
        </div>
      </div>
    </div>
  </section>
</div>
