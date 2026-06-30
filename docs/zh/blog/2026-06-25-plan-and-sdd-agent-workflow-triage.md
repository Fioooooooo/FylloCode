---
title: 用 Plan 和 SDD 给 Agent 的工作流分级
description: 基于 FylloCode 的 OpenSpec 实践，讨论 Plan 与 SDD 的边界，以及如何按风险给 Agent 工作流分级治理。
sidebar:
  order: 5
---

# 用 Plan 和 SDD 给 Agent 的工作流分级

> FylloCode 的工程代码已经通过 OpenSpec 创建了 100+ 次的提案，沉淀出了 80+ specs 文件，近 3w 行源码。在这个实践过程中，我也在思考 `SDD` 是否是目前的最佳工程实践，哪些需求适合使用 SDD，哪些需求只需要 Plan 即可，以及如何定义什么场景适合哪种方式。

随着 Vibe Coding 的热火朝天，大家逐渐意识到真的只靠“气氛”做开发，实际产出的工程代码会变得越来越不可维护，因为每次与 Agent 开始新对话就像直接从头开始，多开几次会话架构就会开始跑偏，所以很多人都开始推崇 Spec-Driven-Development（SDD）。我也算是这其中的一份子。

不管大家用的是什么工具，`spec-kit` 也好，`OpenSpec` 也罢，或者是其他 `GSD`、`Superpowers` 等其他工具，都在维护着自己的一套 spec 流程。但这些流程的中心思想保持一致，就是 spec 先行，把 spec 变成代码库中的 `source of truth`，然后再基于 specs 生成代码。

## 从 SDD 开始

下图是 [InfoQ](https://www.infoq.com/articles/spec-driven-development/) 绘制的 SDD 流程图。
![SDD Governed Software Delivery Pipeline](https://imgopt.infoq.com/fit-in/3000x4000/filters:quality(85)/filters:no_upscale()/articles/spec-driven-development/en/resources/78figure-4-1767777705864.jpg)

SDD 的工作流程如下：

1. 编写规范：以结构化的文档定义需求、场景
2. 审查规范：验证规范是否符合初始意图
3. 实施规范：使用规范来指导 Agent 实施
4. 验证：验证实现结果是否符合规范
5. 更新规格：随着系统发展，保持规格文档同步更新

它的优点很明显：

- 它是工程项目的 `source of truth`
- 明确的规范可以有效防止实现偏差
- 记录项目级的规范，支持团队协作

同时 SDD 的也有一些局限性：

- 建立 SDD 的成本较高，费时间且费 token
- 最好配合一些现成的工具，如 `OpenSpec`
- 绑定了一套工作流，对小功能来说，可能会过于繁琐
- 需要团队一起保持规范同步

在 FylloCode 的实践里，SDD 最有价值的地方不是“先写文档”，而是把会影响多人、多轮对话、多次提交的决策下来。它适合承载长期有效的工程契约，比如对外接口、存储结构、跨模块职责和用户可见行为。

但它也不应该被滥用。如果用户只是需要修正文案、补充测试、增加注释或者调整 guidelines，强制进入 Proposal 流程反而会让 Agent 把注意力放在流程本身，而不是问题本身。治理不应该把所有事情都变重，而应该把不同风险等级的事情放进对应的轨道。

## Plan 模式的价值

和 SDD 经常一起提的，就是 Plan 模式，它相比 SDD 就变得很轻了，很多 Coding Agent 都内置了这个功能。工作流如下：

1. 用自然语言描述任务
2. Agent 探索然后制定计划
3. 审核计划，提出意见
4. Agent 执行计划

Plan 模式的优点是：

- 相比 SDD 成本低
- 快速探索多种方法
- 适用于小功能或需求不明确时
- 相对 SDD 更灵活

Plan 模式的一些缺点：

- 不同 Agent 的实现不同，有的写入临时文件，有的写入项目目录，有的只维护在内存里
- Plan 计划需要与对话内容绑定
- 探索多种方案，实现出现偏差时，没有参考标准
- 时间久了，难验证是否符合最初意图

起初开发 FylloCode，是在考虑了未来研发同学的工作方式后，我认为未来的程序员会去接触更多的一线业务，编码阶段不再需要古法编程，而是需要站在更高维度去审视系统的架构是否合理，只要高层设计不跑偏，编码可以交给 Agent 去做。

但目前 FylloCode 只有 SDD，在面对一些小改动的时候，Agent 依然会偏好先创建 spec，这就导致某些小功能实现起来反而成本也很高，这显然并不是一个好的做法。我建立 FylloCode 的目的是给 Coding Agent 做治理，绝对不应该把一套并不合适的流程强塞给用户。

所以我需要给 FylloCode 做出纠正，不要强使用 `Task->Chat->Proposal->Archive` 这四步工作流，而是根据不同的情况，选择对应合适的工具。鉴于目前各家 Agent 的 Plan mode 实现机制不同，ACP 也没有统一接入，所以 FylloCode 需要提供自己的 `plan` tool，同时把 plan 接入 lineage 中。这样的话，与对话强绑定的 plan.md，也可以通过 lineage 给其他对话提供当时的决策依据。

同时还需要一个明确的判定依据，这样 Agent 才可以明确判定当前是直接实现，还是创建 plan，亦或是走 spec 的 proposal 流程。

## 任务分级判定

我现在倾向于把 FylloCode 的工作流分成三层：

1. 直接实现：局部、明确、低风险、可逆的改动，比如修正文案、调整一个样式、补一个小测试。
2. Plan：不改变对外契约，但涉及多个文件、可以有多种实现方式、需要做架构取舍或风险判断的任务。
3. Proposal：会改变对外契约的任务，比如 IPC、schema、存储格式、用户可见行为、跨模块职责边界等。

这个分级里有两个升级规则：

1. Plan 过程中如果发现会改变对外契约，需要升级为 Proposal；
2. Proposal 在实施前如果方案还不清楚，可以先用 Plan 做探索，再把确定下来的结果沉淀为 Proposal。

这样 Plan 和 SDD 就不是竞争关系。Plan 负责探索和决策，Proposal 负责把长期有效的契约固化下来。直接实现则保留给那些没有必要被流程放大的简单任务。

## 社区讨论给我的启发

Codex 的一位 Maintainer 在 GitHub Discussion 中发起了一个关于 [Plan/Spec 模式的讨论](https://github.com/openai/codex/discussions/7355)，提到了几个设计决策问题：

- 用户更喜欢固定工作流还是更灵活的方式
- 进入 Plan 模式希望自动进入还是明显的切换动作
- 更希望 Plan 是临时还是持久化到文件
- 喜欢一问一答的访谈式还是自由对话形式
- 更希望简单的初步方案，还是更多分析、探索、网络搜索，应该由用户引导多少

我看完了讨论中社区成员的想法后，最关注的是四个问题：

1. Plan 是否需要用户显式进入；
2. Plan 是否应该持久化；
3. Plan 什么时候应该提问，什么时候应该直接产出方案；
4. Plan 应该只是粗略 checklist，还是要成为可执行的工程方案。

由于 FylloCode 已经有了 spec，我对 Plan 模式的考虑是：

- 进入 Plan 的 **成本要足够低**。FylloCode 虽然定义为 Coding Agent 的治理层，但大多时候我们会把它当做 teammate。与 teammate 沟通时，用 button、switch、dropdown 等操作来“显式”切换到 Plan 模式会有些奇怪。
- Plan 要 **足够轻量**，但 Plan 时不可修改代码，只可以做探索和生成方案。Plan 没有固定的工作流程，Agent 可以自由调用工具去做问题分析。
- Plan 也要 **足够灵活**，产出的结果是一份持久化的 plan.md。plan 的结果允许用户做审阅和修改，用户批准后 Agent 按照最新的 plan.md 做实现。
- Plan 要 **足够深入**，产出的 plan.md 要可实行，不能是“plan 的 plan”，要做到足够的探索、分析后产出完整可实行的方案。

## Plan 在 FylloCode 里的位置

Plan 不应该只是一段临时聊天内容。临时聊天的问题是，它在当前对话里看起来很自然，但换一个会话、换一个 Agent、过一段时间之后，决策依据就很难再被找回来。

所以我更倾向于把 Plan 定义成一种工程决策的中间产物。它不如 Proposal 那么重，不负责成为长期规范；但它也不能像普通聊天一样随对话消失。它应该关联到 task、session、proposal 和 commit，成为 Lineage 中的一环。

这样一次复杂任务的路径就会变成：

1. 用户提出需求；
2. Agent 判断它不需要 Proposal，但需要 Plan；
3. Agent 进入只读探索，阅读代码、梳理约束、比较方案；
4. Agent 产出 plan.md；
5. 用户审阅、修改或批准；
6. Agent 按照最终版本的 plan.md 实现；
7. Lineage 记录这次 Plan 和后续实现之间的关系。

如果实现过程中发现 plan.md 已经不成立，那就应该回到 Plan 修改，而不是让 Agent 在实现阶段自行漂移。如果 Plan 过程中发现任务其实改变了契约，那就应该升级成 Proposal。这个边界很重要，因为它决定了 Plan 是治理的一部分，而不是另一个容易失控的自由发挥入口。

## Plan 的边界

Plan 模式最容易出现的问题，是看起来在做计划，实际只是在生成一个“接下来继续研究”的计划。这样的 plan 对工程没有帮助，对用户也没有帮助，因为它没有降低不确定性，也没有给实现提供明确约束。

所以 FylloCode 里的 plan.md 至少应该包含：

1. 任务目标：这次要解决什么问题；
2. 范围边界：哪些会改，哪些不会改；
3. 关键约束：现有架构、数据模型、IPC、UI 或测试上的限制；
4. 方案取舍：为什么选择这个做法，放弃了哪些做法；
5. 实施步骤：Agent 可以按步骤执行的修改路径；
6. 验证方式：完成后应该如何证明这次修改是正确的。

同时 Plan 阶段必须默认只读。Agent 可以搜索、阅读、分析、对比方案，也可以生成 plan.md，但不能直接修改业务代码。只有当用户批准 plan.md 之后，Agent 才能进入实现。这样做的目的不是为了增加仪式感，而是为了把“思考”和“执行”分开，让用户可以在关键决策点介入。

回到最开始的问题，我认为这俩并不是竞争，SDD 不是错，Plan 也不是更先进的替代品。真正的问题是 Agent 参与研发后，项目需要的不再是一条固定流程，而是一套能按风险分级的工程治理机制。简单任务直接做，复杂任务先 Plan，改变契约的任务走 Proposal。FylloCode 要做的，就是把这三条路径都变成 Agent 可以稳定遵守的工作方式。

## 参考资料

- [What Is Spec-Driven Development? A Complete Guide](https://www.augmentcode.com/guides/what-is-spec-driven-development)
- [Spec Driven Development: When Architecture Becomes Executable](https://www.infoq.com/articles/spec-driven-development/)
- [Spec-Driven Development: From Code to Contract in the Age of AI Coding Assistants](https://arxiv.org/html/2602.00180v1)
- [Plan / Spec Mode Discussion](https://github.com/openai/codex/discussions/7355)
