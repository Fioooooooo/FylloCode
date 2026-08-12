---
sidebar:
  group: 产品功能
  order: 25
---

# 多根 Workspace

FylloCode 的 Workspace 把多个 Project 放在同一个窗口，并把它们纳入同一套 Chat、Task 和治理上下文。对于跨代码库的任务，具备额外目录能力的 Agent 可以在一次 Chat Session 中读取已授权的多个项目目录。这样无需在窗口之间切换，也不用反复解释 Project 之间的关系。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/workspace-overview.png" alt="包含多个 Project 的 Workspace 概览截图" />
</figure>

## 它解决什么问题

单项目文件夹的工作模型适合大多数单仓库任务，但跨项目问题往往需要同时查看调用方与服务端、应用与共享库，或代码与文档。把这些目录分别打开时，Agent 也只能分别获得上下文，用户需要在窗口之间切换并反复说明项目之间的关系。

多根 Workspace 让相关 Project 共享一个工作窗口。你可以围绕一个问题开始一次讨论，让 Agent 在授权范围内同时理解多个 Project，再把结论落回各自的项目边界。

## 三个核心概念

| 概念 | 作用 |
| --- | --- |
| **Project** | Workspace 的一个项目成员，代表一个项目目录及其稳定身份。 |
| **Workspace** | 一个窗口级工作上下文，可包含 1–16 个 Project，并指定一个主 Project。 |
| **Session scope** | Chat Session 创建时固定的授权快照，包含主 Project 和当时可用的其他授权 Project。 |

Workspace 可以从一个 Project 开始，也可以继续加入其他 Project。成员顺序和主 Project 会影响后续 Session 的目录范围，但不会改变已经创建的 Session。

## Agent 如何同时读取多个 Project

FylloCode 按以下步骤确定多根 Chat Session 的目录范围：

1. 你在 Launcher 中打开或创建 Workspace，并加入需要协作的 Project。
2. FylloCode 在创建 Chat Session 时记录当时的 Workspace 成员、路径和主 Project，形成固定的 Session scope。
3. 如果所选 Agent 声明支持 additional directories，FylloCode 会把主 Project 作为工作目录，把其他已授权 Project 作为附加目录传给 ACP Session。
4. FylloCode 的 bundled MCP 和文件预览使用同一份授权范围；Agent 不能通过自行提交路径来扩大读取范围。

同时访问多个 Project 需要两个条件：Project 已经加入当前 Workspace，Agent 也支持额外目录能力。Agent 不支持该能力时，Session 仍然可以在主 Project 中运行，但不会访问其他 Project。

## 固定的 Session scope

Workspace 是可以编辑的，但正在运行的 Session 不会跟随编辑实时漂移：

- 创建 Session 后，Workspace 新增、移除、排序、重命名或移动 Project，不会静默修改这次 Session 的目录范围。
- Chat header 的 scope popover 会展示 Session 快照中的 Project、路径和主 Project 标识，并提示当前 Workspace 与快照的差异。
- 如果快照中的 Project 被移除、路径消失或已经移动，FylloCode 不会偷偷替换成新路径或裁剪授权；需要先处理 stale 状态，或创建新的 Session。

因此，Agent 在任务期间看到的代码边界保持稳定，Workspace 编辑也不会意外改变正在进行的任务。

## 多根不等于无边界写入

多根 Workspace 解决的是共享上下文问题，不会抹平各 Project 的所有权：

- Chat Session 可以在 Agent 能力允许且授权有效时读取多个 Project。
- Specs、guidelines、Proposal 和 Git 等 repository-owned 内容仍然保留所属 Project；多根操作需要明确对应的 Project。
- Proposal 的 Apply 与 Archive 仍然只在该 Proposal 所属 Project 或已登记 worktree 中执行，不会因为当前 Workspace 有多个成员就跨项目写入。
- Knowledge 属于 Workspace，可以跨 Project、任务和 Session 共享；引用仓库证据时仍会保留对应的 Project 归属。

## 跨 Project 目标如何进入 Proposal

一个用户目标涉及多个 Project 时，Agent 会先把预期改动拆成每个 Project 的 repository-local 范围，再分别判断 Direct、Plan 或 Proposal。公开 API、schema 或 spec 的变化归拥有权威 contract 或 spec 的 Project；调用方为了适配该变化所做的修改仍属于调用方 Project，并根据自身的契约影响与复杂度单独选择路径。

如果多个 Project 都达到 Proposal 标准，Agent 会在调用 `create-proposal` 前列出每个 Project、触发 Proposal 的具体契约变化，以及已知的跨仓库依赖或执行顺序。确认这个明确集合后，Agent 为每个 Project 分别创建 repository-owned Proposal，并显式使用对应 `folderId`。FylloCode 不会在主 Project 中创建覆盖所有仓库的 umbrella Proposal；没有达到 Proposal 标准的 Project 仍可走 Direct 或 Plan。

每份 Proposal 的 proposal、design、specs 和 tasks 只描述所属 Project 内的契约、文件和验证。跨 Project 的前置关系会记录在相关 design 或 tasks 中，但不会把另一个 Project 的代码任务放入当前 Proposal。

## 适合使用多根 Workspace 的任务

- 同时排查前端、后端和共享库之间的接口问题
- 需要对照应用代码与组件库、脚本或文档仓库
- 一个任务需要理解多个相关 Project 的约束，再分别生成各自的 Proposal
- 希望让跨 Project 的背景知识在同一个 Workspace 中持续复用

开始使用时，可以先看[快速开始](/docs/guide/getting-started)了解如何打开 Project 或 Workspace，再在 [Chat 与执行](/docs/features/chat) 页面查看 Session scope。Agent 的能力限制见 [ACP Agents](/docs/features/agents)，Workspace 聚合视图见[项目概览](/docs/features/overview)。
