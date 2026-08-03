## Context

FylloCode 的持久化与运行时模型需要用 `WorkspaceKind = "folder" | "collection"`、`FolderMeta`、`folderId` 等精确术语表达身份和授权边界；这些术语也出现在 MCP descriptor、Session snapshot、migration、日志和 OpenSpec 内部不变量中。当前 renderer 却直接把 `Folder Workspace`、`Collection Workspace`、`Folder`、`Workspace` 上位概念及 cleanup state 用作界面文案，导致用户必须理解内部模型，并让新页面继续复制同一问题。

本变更面向以工程仓库为主要对象的产研用户，建立独立的呈现层语义：单工程目录是 `Project`，用户显式组合的一个或多个 Project 是 `Workspace`。这是一项跨 launcher、repository browser、automation、Chat 和错误边界的呈现规范，不是领域模型重命名。

## Goals / Non-Goals

**Goals:**

- 用一条可复用的语义规则覆盖现有和未来用户可见文案，而不是维护逐字符串替换清单。
- 在运行时 kind 已知时稳定映射为 `Project` 或 `Workspace`；共同入口和未知 kind 场景使用不会误称任一类型的中性文案。
- 让 member/repository owner 在用户语境中呈现为 Project，让物理路径操作呈现为“项目目录”。
- 为 renderer 提供单一术语映射与错误呈现入口，并用 guideline、静态检查和代表性测试防止新增界面回退到内部术语。
- 保持用户可见的原生 Main 对话框与 renderer 文案遵循同一规则。

**Non-Goals:**

- 不重命名 `WorkspaceKind`、`WorkspaceMeta`、`FolderMeta`、`ResolvedWorkspace`、`folderId`、`workspaceId` 或任何 TypeScript symbol。
- 不修改 IPC/preload API、schema、storage namespace、migration、MCP descriptor、Agent system reminder 或 repository ownership contract。
- 不把所有内部规范和日志中的 Folder/Collection 改为 Project/Workspace；内部、Agent-facing 和诊断语境继续使用精确领域术语。
- 不要求 Project 必须是 Git repository；非 Git 工程目录仍可作为 Project，只有 repository-specific 功能继续按既有能力判断。
- 不建立集中保存所有完整句子的 copy catalog。

## Decisions

### 1. 呈现层使用语义映射，不修改领域模型

用户呈现规则固定为：

- `kind: "folder"` 的顶层对象显示为 `Project`；
- `kind: "collection"` 的顶层对象显示为 `Workspace`，即使它只有一个 member；
- Workspace member、repository owner、Folder filter 和 target Folder 显示为 `Project`；
- 当用户正在选择、重新定位或诊断 path 时使用“项目目录”，避免把 Project 与文件系统目录混为一词；
- 同时容纳两种 kind 的列表或管理入口使用“最近打开”“回收站”等中性名；必须指代具体对象时按 kind 动态生成，不使用内部 `Workspace` 上位概念代称 Project。

选择该方案而不是 `单文件夹工作区 / 多文件夹工作区`，因为 Collection 可以合法只含一个 Folder，按数量命名会产生错误语义。选择 `Project` 而不是继续显示 `Folder`，因为主要用户处理的是工程仓库，Project 更接近任务心智；路径相关动作仍明确称为项目目录，保留非 Git 目录兼容性。

### 2. 单一模块提供术语原子与用户错误投影

在 renderer 增加 `src/renderer/src/utils/workspace-presentation.ts`，集中提供纯函数和只读映射，包括：

- `workspaceKindLabel(kind)`：返回 `Project | Workspace`；
- 面向 kind 可选场景的 subject label：已知 kind 返回对应类型，未知时返回 `Project 或 Workspace` 或由调用方采用中性句式；
- member、primary member、项目目录等术语原子；
- `workspaceCleanupStateLabel(state)`：将内部 cleanup state 映射为用户状态；
- 基于结构化 error code 与可选 kind 的用户错误投影，避免 renderer 直接展示包含内部术语的 Main message。

组件仍负责组合符合自身上下文的完整句子，但不得复制 kind 判断和核心名词映射。Main 的内部错误文本、日志和 error details 保持领域术语；只有 renderer presentation boundary 将 error code 转换为用户文案。无法经过 renderer 的原生启动失败对话框直接使用中性 Project/Workspace 文案。

没有把呈现常量放入 shared domain：用户 copy 属于 renderer presentation policy，写入 shared 会让内部 contract 反向依赖 UI。Main 仅有的原生对话框保留局部中性文案，不复制 kind 映射逻辑。

### 3. 规范约束语义，实施不维护文案清单

`workspace-presentation-terminology` spec 只规定映射、不变量和边界，不枚举每个按钮或句子。现有页面按能力区域迁移，验收依据是它们是否遵守语义规则，而不是与一份易过期的替换表逐字比对。

`guidelines/UiDesign.md` 增加同一术语规则，要求未来 UI 在设计和 review 阶段先判断当前对象是 Project、Workspace、Project member、项目目录还是共同范围；`guidelines/QualityGates.md` 记录对应 lint 门禁。OpenSpec 负责用户行为契约，guideline 负责工程落点和新增界面约束。

### 4. 静态检查阻止内部术语重新进入用户 copy

新增本地 ESLint 规则 `scripts/eslint-rules/renderer-user-terminology.mjs`，接入 `eslint.config.mjs` 并以聚焦 RuleTester/Vitest 用例验证。规则检查 renderer 的字符串与 Vue template 文本中的用户文案，阻止直接出现 `Folder Workspace`、`Collection Workspace`、作为展示名的 `Folder` / `Collection`；内部 identifiers、lowercase enum value、data attribute 与代码 symbol 不属于用户文案。Cleanup state 是否被直接插值由呈现 helper 的类型边界和聚焦组件测试约束，避免静态规则误伤合法的 state 比较。

对于确属 Agent-facing、协议或诊断用途的 renderer 字符串，规则允许显式、可审查的非用户语境标记，而不是按当前文件列表维护永久 allowlist。这样新增用户界面默认受约束，新增内部协议文本也必须明确声明边界。

静态规则只能阻止明显泄漏，不能判断某个合法 `Workspace` 是否错误地代称了 Project。因此代表性 component/store tests 还要覆盖：同一入口分别渲染 folder/collection kind、单 member collection 仍显示 Workspace、共同列表使用中性名称、cleanup state 被映射、结构化错误不透传内部 message。

### 5. 现有界面按语义区域迁移

Apply 阶段按 launcher/lifecycle、全局导航、repository-owned browsers、automation、Chat/Session、用户错误边界分组迁移。每组复用术语模块并更新相关组件测试；不把当前字符串集合复制到 spec、design 或长期 guideline 中。一次性 source inventory 只用于发现现存泄漏和确认迁移完成，不成为后续权威清单。

## Risks / Trade-offs

- [Project 可能被理解为必须是 Git repository] → 路径选择、missing 和 relocation 文案使用“项目目录”，repository-only 功能继续单独报告 Git 能力，不把 Project 定义为 Git-only。
- [静态规则误判 Agent-facing 或诊断字符串] → 使用显式非用户语境标记并要求聚焦测试，避免维护文件级 allowlist或关闭整条规则。
- [合法单词 Workspace 仍可能被错误用于 Project] → kind-sensitive UI 必须复用 `workspaceKindLabel`，并为 folder/collection 两种 fixture 建立代表性测试；guideline 明确禁止把内部上位概念当用户统称。
- [跨多个页面的文案调整遗漏] → 先落地映射模块和静态规则，再按区域迁移；最后运行 renderer terminology audit、renderer tests、typecheck 和 lint。
- [将文案策略放进 shared 会污染内部 contract] → 映射模块留在 renderer，Main 原生对话框只使用不依赖 kind 的中性文案。

## Migration Plan

1. 新增 renderer 术语映射/错误投影模块及其单元测试。
2. 新增 ESLint 用户术语规则、配置和规则测试，使新的内部术语泄漏先变为可见失败。
3. 按 UI 区域迁移当前用户呈现，保留所有内部类型、参数和数据结构。
4. 更新 `guidelines/UiDesign.md`、`guidelines/QualityGates.md` 与相关 OpenSpec 用户呈现要求。
5. 运行聚焦 renderer/Main 测试、全量 `pnpm test`、`pnpm typecheck`、`pnpm lint`、Prettier 和 `git diff --check`；不要求完整 build 或启动 dev。

本变更只改源码和规范，可通过回退提交恢复，不涉及数据回滚。

## Open Questions

无。Project/Workspace 映射、main worktree 实施和内部术语保持不变均已确认。
