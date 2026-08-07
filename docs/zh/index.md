---
layout: home
title: FylloCode — Claude Code、Codex 的项目工作台，管理 Coding Agent 上下文
titleTemplate: false
description: FylloCode 是一个开源桌面应用，把 Claude Code、Codex 等本地 Coding Agent 接进项目工作流。派任务、审方案、追溯每一次改动，积累下来的规范和结论，换一个 Agent 也能继承。MIT 开源，数据全部在本地。
markdownStyles: false

hero:
  name: FylloCode
  text: 让 Agent 越来越懂你的项目
  tagline: FylloCode 是一个开源桌面应用，把 Claude Code、Codex 等本地 Coding Agent 接进项目工作流。派任务、审方案、追溯每一次改动，积累下来的规范和结论，换一个 Agent 也能继承。
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
        <img src="/assets/diagrams/lineage.png" alt="任务和对话汇入会话，再连接 Plan、Proposal 与提交的工作脉络图" loading="lazy" />
        <figcaption>任务和对话汇入同一条脉络，再连接 Plan、Proposal 与提交</figcaption>
      </figure>
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">工作脉络</span>
        <h2>三个月后，还能说清这行代码为什么这么改</h2>
        <p>一次 Agent 改动可能涉及上百个文件，<code>git blame</code> 只能告诉你谁提交了它。FylloCode 把任务、对话、Plan、Proposal 和提交连成一条线。下次动这块代码的人，不用把当时的判断重新推一遍。</p>
        <ul class="fc-key-list">
          <li><strong>起点</strong><span>一条任务，或一次直接发起的对话。</span></li>
          <li><strong>依据</strong><span>讨论如何收敛、方案选了哪条、哪些选项被否掉。</span></li>
          <li><strong>落点</strong><span>最终的实现和提交，仍然在同一条线上。</span></li>
        </ul>
        <div class="fc-links">
          <a class="fc-link" href="/docs/guide/lineage">阅读工作脉络指南</a>
          <a class="fc-link" href="/docs/features/lineage">查看工作脉络</a>
          <a class="fc-link" href="/blog/2026-06-19-design-of-lineage">Lineage 的设计思路</a>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-path-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">工作路径</span>
        <h2>改一行文案，不该走完整套评审</h2>
        <p>范围明确的改动直接完成；需要先理清思路的，写一份 Plan；涉及公开 API、schema 或用户可见行为的，才进 Proposal。</p>
      </div>
      <div class="fc-path-layout">
        <figure class="fc-diagram-frame">
          <img src="/assets/diagrams/three-paths.png" alt="一次改动根据性质分流到三条工作路径的图" loading="lazy" />
          <figcaption>一次改动根据性质分流到三条工作路径</figcaption>
        </figure>
        <div class="fc-path-grid">
          <article class="fc-path-card">
            <span class="fc-path-card__number">01</span>
            <div>
              <h3>直接实现</h3>
              <p>范围明确，直接完成。</p>
            </div>
          </article>
          <article class="fc-path-card">
            <span class="fc-path-card__number">02</span>
            <div>
              <h3>Plan</h3>
              <p>先把思路和取舍写下来，再动手。</p>
            </div>
          </article>
          <article class="fc-path-card fc-path-card--featured">
            <span class="fc-path-card__number">03</span>
            <div>
              <h3>Proposal</h3>
              <p>契约发生变化，留下可评审的依据。</p>
            </div>
          </article>
          <div class="fc-links">
            <a class="fc-link" href="/docs/guide/change-paths">了解三线工作方式</a>
            <a class="fc-link" href="/docs/features/proposal">查看 Proposal</a>
            <a class="fc-link" href="/blog/2026-06-25-plan-and-sdd-agent-workflow-triage">为什么要分级</a>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-proposal-record-section">
    <div class="fc-section__inner fc-showcase fc-showcase--reverse">
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">Proposal 记录</span>
        <h2>Proposal 中不只是结论</h2>
        <p>为什么选这条路、哪些方案被否掉、风险如何控制、怎么迁移、拆成哪些任务，都在同一份记录里。归档时，这次改动涉及的能力规约会跟着一起更新。</p>
        <div class="fc-links">
          <a class="fc-link" href="/docs/features/proposal">查看 Proposal</a>
          <a class="fc-link" href="/docs/guide/change-paths">了解评审流程</a>
        </div>
      </div>
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/proposal.png" alt="Proposal 将背景、方案取舍、风险、迁移、任务和能力规约连接成决策记录的图" loading="lazy" />
        <figcaption>Proposal 把背景、取舍、风险、迁移、任务和规约放在同一份记录里</figcaption>
      </figure>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-context-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">项目资料</span>
        <h2>Agent 的四种记忆，按需获取</h2>
        <p>把决策、约定、事实和契约压进同一份记忆，检索的时候只会互相干扰。FylloCode 按类型分开存放，Agent 每次只读与当前工作相关的那部分，不必把整份记忆塞进上下文。</p>
      </div>
      <div class="fc-context-grid">
        <article class="fc-context-card fc-context-card--lineage">
          <span class="fc-context-card__token">工作脉络</span>
          <h3>这次改动是怎么发生的</h3>
          <p>任务、对话、Plan、Proposal 和提交串成一条线。</p>
          <a class="fc-link fc-link--on-dark" href="/docs/features/lineage">查看工作脉络</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">项目准则</span>
          <h3>这个项目该怎么写代码</h3>
          <p>架构边界、测试要求、协作约定，跟着代码库一起提交。</p>
          <a class="fc-link" href="/docs/features/guidelines">查看项目准则</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">知识</span>
          <h3>代码里查不到的事实</h3>
          <p>长时间排查才得出的结论，和只有你知道的业务背景。</p>
          <a class="fc-link" href="/docs/features/knowledge">查看知识沉淀</a>
        </article>
        <article class="fc-context-card">
          <span class="fc-context-card__token">能力规约</span>
          <h3>已经定下来的契约</h3>
          <p>Proposal 归档时同步生成，是项目正式的行为边界。</p>
          <a class="fc-link" href="/docs/features/specs">查看能力规约</a>
        </article>
      </div>
    </div>
  </section>
  <section class="fc-section fc-settlement-section">
    <div class="fc-section__inner fc-showcase">
      <figure class="fc-diagram-frame">
        <img src="/assets/diagrams/project-state.png" alt="三条工作路径将相关结果回流到项目状态，并由工作脉络、项目准则、知识和能力规约共同影响下一次会话的图" loading="lazy" />
        <figcaption>每一条工作路径都会把产出结果回流到项目，供下一次会话继续使用</figcaption>
      </figure>
      <div class="fc-showcase__content">
        <span class="fc-eyebrow">沉淀与反哺</span>
        <h2>不用你提醒，Agent 自己知道什么该留下</h2>
        <p>普通 Agent 会话结束后，有价值的结论就散在聊天记录里了。</p>
        <ul class="fc-key-list">
          <li><strong>它提出</strong><span>反直觉的结论、代价远大于产出的排查，Agent 在固定检查点主动标记。</span></li>
          <li><strong>你确认</strong><span>标记不打断讨论，确认之后才写回项目。</span></li>
          <li><strong>下次生效</strong><span>新会话开始时，准则索引和知识直接注入给 Agent。</span></li>
        </ul>
        <div class="fc-links">
          <a class="fc-link" href="/docs/features/knowledge">查看知识沉淀</a>
          <a class="fc-link" href="/docs/features/guidelines">查看项目准则</a>
          <a class="fc-link" href="/blog/2026-07-15-durable-knowledge">知识如何主动沉淀</a>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-section--tinted fc-scale-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <span class="fc-eyebrow">从一个项目开始</span>
        <h2>在你已经有的项目里开始</h2>
        <p>不需要迁移代码，正在用的 Agent 也可以直接接入 FylloCode。打开一个本地仓库即可开始，多个仓库可以放进同一个工作区。</p>
      </div>
      <div class="fc-scale-layout">
        <figure class="fc-diagram-frame fc-scale-diagram">
          <img src="/assets/diagrams/workspace.png" alt="工作区连接多个项目、Agent 客户端和研发系统，同时保留上下文边界的图" loading="lazy" />
          <figcaption>一个工作区，连接多个项目、Agent 和既有系统</figcaption>
        </figure>
        <div class="fc-scale-content">
          <article>
            <h3>打开</h3>
            <p>选一个本地仓库作为 Project，也可以把多个 Project 放进同一个 Workspace。</p>
            <a class="fc-link" href="/docs/guide/getting-started#打开-project-或-workspace">打开项目或工作区</a>
          </article>
          <article>
            <h3>连接</h3>
            <p>接入你正在使用的 ACP Agent，以及云效这类已有的研发系统。</p>
            <div class="fc-links">
              <a class="fc-link" href="/docs/features/agents">查看 Agent</a>
              <a class="fc-link" href="/docs/features/integrations">查看研发系统集成</a>
            </div>
          </article>
          <article>
            <h3>开始</h3>
            <p>创建一条任务，完成第一条工作脉络。</p>
            <a class="fc-link" href="/docs/guide/change-paths">开始第一条工作主线</a>
          </article>
        </div>
      </div>
    </div>
  </section>
  <section class="fc-section fc-cta-section">
    <div class="fc-section__inner fc-cta">
      <span class="fc-eyebrow">开始使用</span>
      <h2>从今天的工作开始积累</h2>
      <p>不需要额外的整理时间。按你原来的方式开发，FylloCode 让项目状态逐渐清晰起来。</p>
      <div class="fc-cta__actions">
        <a class="fc-btn fc-btn--brand" href="https://github.com/Fioooooooo/FylloCode/releases">下载桌面端</a>
        <a class="fc-btn" href="/docs/guide/getting-started">阅读快速开始</a>
      </div>
      <ul class="fc-trust">
        <li>MIT 开源</li>
        <li>免费使用</li>
        <li>数据都在本地</li>
      </ul>
      <ul class="fc-platforms">
        <li class="fc-platform">
          <strong>macOS</strong>
          <span>Apple Silicon / Intel</span>
        </li>
        <li class="fc-platform">
          <strong>Windows</strong>
          <span>x64 安装包</span>
        </li>
        <li class="fc-platform">
          <strong>Linux</strong>
          <span>AppImage / deb（x64）</span>
        </li>
      </ul>
    </div>
  </section>
</div>
