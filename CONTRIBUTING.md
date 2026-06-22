# 贡献指南

[英文版](CONTRIBUTING.en.md)

感谢你对 FylloCode 的兴趣。这份文档说明如何在本地搭建开发环境、如何提交代码，以及一些基本约定。

---

## 开发环境

**依赖要求**

- Node.js 22+
- pnpm 10+

**本地启动**

```bash
git clone https://github.com/Fioooooooo/FylloCode.git
cd FylloCode
pnpm install
pnpm run dev
```

---

## 用 FylloCode 开发 FylloCode

FylloCode 自身就在用 FylloCode 开发。推荐用 `Releases` 里的打包版本来参与贡献，而不是用 npm run dev 启动的版。原因很直接：dev
模式有热重载，Apply 阶段一旦开始修改源码，热重载会打断正在进行的工作流。打包版本没有这个问题。

具体做法：下载当前最新版本，把 FylloCode 仓库作为项目打开，在 Task 里描述你要做的事，走一遍 Proposal → Apply →
Archive，而不是直接对着代码开写。

这不是强制要求，但这样做有两个好处：一是你会更快理解这个项目的设计意图，二是如果工作流里有什么卡住你的地方，那本身就是值得修的
bug。

---

## 提交流程

**小改动**（typo、文档、小 bug）：直接开 PR，不需要提前沟通。

**大改动**（新功能、架构调整、行为变更）：先开一个 Issue 描述你的想法，等有了基本共识再动手。这能避免你写完之后发现方向对不上。

**PR 的基本要求：**

- 标题说清楚做了什么，不需要长篇大论
- 如果改了用户可感知的行为，在 PR 描述里说一下影响范围
- 保持每个 PR 聚焦在一件事上

---

## Issue 规范

**报 bug**：描述复现步骤、实际行为、期望行为。系统信息（OS、版本号）能附上尽量附上。

**提需求**：说你在什么场景下遇到了什么问题，不需要直接给解决方案。

提 Issue 之前先搜一下，避免重复。

---

## 代码风格

项目使用 ESLint + Prettier，提交前跑一下：

```bash
pnpm run lint
pnpm run typecheck
```

commit message 格式：

```text
type(scope): summary

- 可选的补充说明，用 bullet 列出关键变更点
```

常用 type：`feat` · `fix` · `refactor` · `docs` · `chore` · `perf` · `test`

scope 对应模块或功能区域，比如 `proposal`、`specs`、`archive`、`worktree`、`chat`、`acp`。summary 动词开头，一句话说清楚做了什么。

---

## 许可证

贡献的代码遵循仓库的 [MIT](LICENSE) 许可证。
