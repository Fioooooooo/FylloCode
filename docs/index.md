---
layout: home
title: FylloCode
markdownStyles: false

hero:
  name: FylloCode
  text: Coding Agent 的团队治理层
  tagline: 让全队的 Agent 遵守同一套持续进化的规则，从 Task、Chat 到 Proposal、Archive 由 lineage 串成一条可追溯的决策主线。
  image:
    src: /assets/icon.svg
    alt: FylloCode
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 下载桌面端
      link: https://github.com/Fioooooooo/FylloCode/releases
    - theme: alt
      text: 了解工作流
      link: /guide/workflow
---

<main class="fc-landing">
  <section class="fc-section">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <h2>Agent 写下代码之前，先留下可审查的决策</h2>
        <p>
          FylloCode 不替代 IDE、CI/CD 或项目管理系统。它在现有代码库和研发工具链之上，为团队持续使用 Coding Agent
          提供结构化的上下文、约束和留痕，增强工程开发。
        </p>
      </div>
      <div class="fc-grid">
        <article class="fc-card">
          <h3>统一规范</h3>
          <p>向所有 Agent 暴露项目级规范，让架构边界、命名约定和禁区做到跨 Agent、跨会话持续生效。</p>
        </article>
        <article class="fc-card">
          <h3>决策留档</h3>
          <p>每个 proposal 的依据、取舍和被放弃的方案都会沉淀为结构化记录，而不是停留在一次聊天里。</p>
        </article>
        <article class="fc-card">
          <h3>全程可追溯</h3>
          <p>从任务意图到沟通决策，再到实现、审查和归档，每个阶段都有明确产物，方便回看一次变更为什么发生。</p>
        </article>
        <article class="fc-card">
          <h3>规则自进化</h3>
          <p>将团队实践沉淀为持久化知识，Agent 的下一次执行自动从最新规则开始。</p>
        </article>
      </div>
    </div>
  </section>

  <section class="fc-section fc-section--tinted">
    <div class="fc-section__inner">
      <div class="fc-section__header">
        <h2>一条可追溯、自进化的变更主线</h2>
        <p>
          从 Task 到 Chat、Proposal，再到 Apply &amp; Archive，每一步的输入、决策和产物都被 lineage 记录成一条可追溯的线索。
          固化下来的知识与规范会自动成为下一次任务的起点，让主线闭环、持续进化。
        </p>
      </div>
      <div class="fc-steps">
        <article class="fc-step">
          <strong>01</strong>
          <h3>Task</h3>
          <p>主线的起点，可以由团队成员直接创建，也可以从已接入的第三方研发系统同步进来，作为后续协作的统一入口。</p>
        </article>
        <article class="fc-step">
          <strong>02</strong>
          <h3>Chat</h3>
          <p>Agent 在对话里分析需求、检索代码佐证、引导团队权衡取舍，与你一起收敛出最终决策，而不是凭空给出方案。</p>
        </article>
        <article class="fc-step">
          <strong>03</strong>
          <h3>Proposal</h3>
          <p>把对话中确认的决策固化为 proposal、design、specs、tasks 四件套，让方案评审有实体，也让未来能追溯设计依据。</p>
        </article>
        <article class="fc-step">
          <strong>04</strong>
          <h3>Apply &amp; Archive</h3>
          <p>Agent 在约束下实现变更，归档时把决策上下文、spec 更新和 guidelines 演进沉淀为下一次任务的背景知识。</p>
        </article>
      </div>
    </div>
  </section>

  <section class="fc-section">
    <div class="fc-section__inner fc-showcase">
      <div class="fc-split">
        <h2>从任务看板到 Proposal 归档</h2>
        <p>
          产品界面围绕工程团队的日常协作组织：任务看板负责收口入口，Proposal 页面承载评审和归档，对话面板负责与 Agent
          推进执行，Workflow 编辑器负责把流程固化下来。
        </p>
        <div class="fc-links">
          <a class="fc-link" href="/features/overview">项目概览</a>
          <a class="fc-link" href="/features/task">任务看板</a>
          <a class="fc-link" href="/features/proposal">Proposal 评审</a>
          <a class="fc-link" href="/features/workflow">Workflow 编排</a>
        </div>
      </div>
      <figure class="fc-screenshot">
        <img src="/assets/screenshots/task.png" alt="FylloCode 任务看板截图" />
      </figure>
    </div>
  </section>

  <section class="fc-section fc-section--tinted">
    <div class="fc-section__inner fc-showcase">
      <figure class="fc-screenshot">
        <img src="/assets/screenshots/acp-registry.png" alt="FylloCode ACP Agents 截图" />
      </figure>
      <div class="fc-split">
        <h2>接入现有 Agent 与研发系统</h2>
        <p>
          FylloCode 通过 ACP 接入不同 Coding Agent，通过集成提供方把任务结果回写到已有研发系统。团队可以保留现有工具链，同时补上
          Agent 协作需要的治理层。
        </p>
        <div class="fc-links">
          <a class="fc-link" href="/features/agents">ACP Agents</a>
          <a class="fc-link" href="/features/integrations">研发系统集成</a>
          <a class="fc-link" href="/reference/acp-agent-kind">Agent 分类</a>
        </div>
      </div>
    </div>
  </section>
</main>
