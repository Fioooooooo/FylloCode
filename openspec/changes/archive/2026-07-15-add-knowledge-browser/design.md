## Context

Knowledge 条目存储在项目 app data 的 `knowledge/*.md` 中，现有 `readKnowledgeIndex()` 已负责扫描、校验 frontmatter、计算 anchor status，并把损坏文件隔离为 index errors。当前 `insight:knowledge` 只暴露按名称读取和保存 raw markdown 的接口，renderer 的 `KnowledgeReviewSlideover` 又绑定 chat session 与 Fyllo Action 状态，不能承担项目级浏览。

现有 `/guidelines` 页面提供了最接近目标的双栏 reader 模式，`OverviewStatsBar.vue` 则集中维护治理健康入口。新增能力跨越 shared IPC contract、main service、preload、renderer store 和 route，因此需要明确读取边界、删除安全性、异常隔离和 frontmatter 展示策略。

## Goals / Non-Goals

**Goals:**

- 提供独立 `/knowledge` 页面，以左侧分组列表和右侧只读 reader 浏览当前项目 knowledge。
- 复用现有 scanner 作为条目元数据与 `active`、`suspect`、`unknown` 状态的唯一事实源。
- 完整展示原始 Markdown，包括字段数量和数组长度不固定的 YAML frontmatter，且 renderer 不做字段级解析。
- 允许用户经二次确认安全删除一个合法 knowledge 文件，并对并发、失败和选择迁移给出确定行为。
- 在 overview 治理健康卡片增加知识摘要和导航，同时保持 overview 主数据错误隔离。

**Non-Goals:**

- 不在知识页面编辑、创建、capture、update、retire 或重新序列化 knowledge。
- 不改变 knowledge frontmatter 的既有 schema、anchor status 算法或 app data 存储格式。
- 不复用或改变绑定 session/action 的 `KnowledgeReviewSlideover`。
- 不把 `/knowledge` 加入 ActivityBar，不新增外部依赖，不实现全文索引或服务端搜索。

## Decisions

### 1. 新增 browser 查询与删除 IPC，保留 raw document API

在 `src/shared/types/knowledge.ts` 定义：

- `KnowledgeBrowserEntry`：`name`、`description`、`type`、`updatedAt`、`status`；
- `KnowledgeBrowserError`：`path`、`type`、`message`，以及仅在文件名能通过 `knowledgeEntryNameSchema` 时存在的 `name`；
- `KnowledgeBrowserOverview`：`entries` 和 `errors`。

在 `InsightKnowledgeChannels` 增加 `getBrowser: "insight:knowledge:getBrowser"` 和 `deleteEntry: "insight:knowledge:deleteEntry"`。`getBrowser` 只接收 `projectId`；`deleteEntry` 接收 `projectId` 和合法 `name`。Main IPC 继续使用 shared Zod schema、`resolveProjectPath()` 与 `wrapHandler()`。

`getKnowledgeBrowser()` 位于 `src/main/services/insight/knowledge/knowledge-document-service.ts`，调用 `readKnowledgeIndex(knowledgeDir(projectPath), projectPath)` 并裁剪掉 body、content hash 和 anchor details，避免列表响应携带所有正文。正文选择后继续调用既有 `readEntry`，使列表响应大小只随条目数量线性增长。

`deleteKnowledgeEntry()` 与 `readKnowledgeEntry()`、`saveKnowledgeEntry()` 复用同一安全路径解析逻辑，只允许删除 `knowledge/<validated-name>.md`。不存在的文件返回 `KNOWLEDGE_ENTRY_NOT_FOUND`，其他文件系统错误由统一 IPC error 流程返回；删除不修改仓库文件或其他 knowledge。

替代方案是把 knowledge 内容并入 `ProjectOverview` 或一次返回全部 raw markdown。前者会把 overview 与 knowledge 扫描失败耦合，后者会让 overview 和列表首屏承担不必要的正文传输，因此不采用。

### 2. Renderer store 是 browser index 的共享事实源，detail 留在 reader 局部状态

扩展 `useKnowledgeStore()`，增加 `data`、`loading`、`error`、`load(projectId?)`、`deleteEntry(projectId, name)` 和 `clear()`；保留现有 `readEntry`、`saveEntry`，避免影响 review workflow。`load()` 采用与 `useGuidelinesStore()` 相同的 current-project race guard，项目切换时不得提交旧项目结果。

overview 和 `/knowledge` 都从该 store 读取 index。overview 在项目变化时并行触发 overview 与 knowledge load，但 knowledge 失败只让知识入口显示“暂不可用”，不设置 `overviewStore.error`。知识页面选择的 raw document、detail loading/error 和请求序号保留在 reader UI 局部；快速切换条目时，迟到响应不得覆盖当前选择。

替代方案是在 overview stats 中新增 knowledge 字段，但这会改变 overview service 的聚合职责并扩大失败域。共享 knowledge store 能直接复用刚加载的 index，又保持 domain owner 清晰。

### 3. 独立 route 使用传统 renderer 页面结构，不进入 `features/**`

Knowledge browser 当前只有一个 route、一个 insight domain store 和一组页面内的列表/详情/删除交互，不具备多宿主装配、跨 feature 编排、独立状态机或复杂 application lifecycle。它 SHALL 按 `RendererProcess.md` 的传统结构落地，不创建 `src/renderer/src/features/knowledge-browser/**`：

- `src/renderer/src/pages/knowledge.vue`：拥有项目监听、列表选择、detail 请求隔离和删除后的选择迁移等页面流程；
- `src/renderer/src/components/knowledge/KnowledgeBrowserList.vue`：通过 props/emits 展示分组列表和扫描错误，不访问 API；
- `src/renderer/src/components/knowledge/KnowledgeDocumentReader.vue`：通过 props/emits 展示 header、raw Markdown、loading/error/empty 和删除意图，不访问 API；
- `src/renderer/src/utils/knowledge-markdown.ts`：提供纯展示转换 `prepareKnowledgeMarkdownForDisplay()`。

页面外框复用 `/guidelines` 的 `flex flex-1 overflow-hidden bg-elevated space-x-2` 模式：左栏使用 `w-72 rounded-lg bg-default`，右栏使用 `min-w-0 flex-1 rounded-lg bg-default`。左栏通过 `PageHeader` 展示标题，按 `project`、`reference`、`feedback` 分组；组内先按状态优先级 `suspect`、`unknown`、`active`，再按 `updatedAt` 倒序。每项使用 `UiSurface` 并显示文字 badge，不只依赖颜色。

Scanner errors 单独放在“无法索引”分组。若错误文件的 stem 是合法 knowledge name，则允许读取 raw document 和删除；否则只显示 path 与错误信息，不提供读取或删除动作。这样既不静默隐藏损坏文件，也不放宽安全路径契约。

替代方案是为该页面建立小型 `knowledge-browser` feature。该方案虽然能提供 feature 公共入口，但会把单页面、小规模能力也纳入 `features/**`，使目录随页面数量膨胀并弱化“复杂功能编排”的准入语义，因此不采用。只有当 knowledge 查看未来出现多个宿主入口、独立状态机、跨 feature 副作用或需要 application/integration 分层时，才重新评估迁入 feature。

### 4. Frontmatter 只做边界包装，不做字段解析

`prepareKnowledgeMarkdownForDisplay(content)` 只匹配文件开头可选 BOM、`---` 起始行和第一个对应 `---` 结束行。匹配成功时，将包含两个 delimiter 的完整 frontmatter 文本放入 YAML fenced code block，后续正文保持原样；未匹配时原文透传。Fence 长度根据 frontmatter 中最长连续 backtick 动态选择，避免任意 YAML 字符串提前关闭 code block。

右栏把转换结果交给现有 `MarkStream`，`enableActions` 保持关闭。转换不调用 YAML parser，不读取字段、不限制数组条数、不改变磁盘内容。该纯函数需要覆盖 BOM、CRLF、大数组、frontmatter 内 backtick、缺失 closing delimiter 和无 frontmatter 情况；regex 必须按 `CodeComments.md` 用中文说明边界策略。

直接把 raw `--- ... ---` 交给 CommonMark renderer 可能被解释为 thematic break、setext heading 或普通段落，无法稳定得到可读 YAML，因此选择展示层包装。

### 5. 删除使用现有 ConfirmDialog，并在成功后确定性迁移选择

右栏 header 为当前可操作条目提供删除按钮。点击后调用 `useConfirmDialog()`，标题包含 knowledge name，description 明确删除 app data 中的 `<name>.md` 且不可撤销，确认按钮为“删除知识”并使用 `confirmColor: "error"`。

确认后才调用 store `deleteEntry()`；请求期间禁用重复删除，不做乐观移除。成功后重新加载 browser index，并优先选择删除项在原有可选列表中的下一项，没有下一项则选择上一项；列表为空时显示标准空态。失败时保留当前选择和正文，并在 reader 内显示“发生了什么 + 下一步怎么做”的错误，不关闭或伪造成功状态。

解析异常但 name 合法的文件遵循同样流程。删除不存在文件不自动视为成功，以便用户明确知道本地状态已发生并发变化并可重新加载。

### 6. Overview 入口是统一治理网格中的独立 knowledge 状态投影

治理健康卡片在首个分隔线下使用三列治理入口网格，能力规约、归档提案、项目准则和知识沉淀使用同一 button 模板；知识沉淀作为第四项自然进入第二排，后续入口可继续按每排三项扩展。知识入口以不带单位的数字展示 scanner 发现的文件总数，即 `entries.length + errors.length`；需要关注的数量为 `suspect`、`unknown` 与 scanner errors 之和，并使用不带“条”的文字提示。loading 显示“正在加载…”，错误显示“暂不可用”。无论 count、loading 或 error，点击均导航 `/knowledge`，让用户在独立页面查看详细空态或错误。

`OverviewStatsBar` 通过 props 接收 knowledge summary，并复用组件现有 router 导航模式打开 `/knowledge`，但不直接调用 API。`overview.vue` 负责在当前项目变化时协调两个 owner store，避免展示组件承担跨域异步流程。入口不加入 `activityBarItems`。

## Risks / Trade-offs

- [扫描每次都会验证 anchors，条目很多时 overview 与知识页可能重复扫描] → 复用 Pinia index 状态；同项目已有成功数据时页面可先展示，显式 load 再刷新。首版不引入缓存失效协议，保持数据正确性优先。
- [Frontmatter delimiter 出现在 YAML block scalar 中] → 只接受位于行首且整行等于 `---` 的第一个结束 delimiter，与当前 scanner 的边界约定一致；异常文件按原文透传并由 scanner error 提示。
- [删除是不可撤销的 app data 操作] → 只允许 schema 校验后的 basename、复用安全路径检查、使用 destructive confirm、服务端成功后再更新 UI。
- [Scanner error 没有合法 name 时无法从 UI 清理] → 明确展示路径和错误但禁用危险动作；不为便利引入任意 path 删除 API。
- [`/knowledge` 不在 ActivityBar 中时没有独立 active indicator] → 保持用户确认的“overview 治理入口”定位，页面仍可通过 ActivityBar 的 overview 返回；首版不增加新的全局导航层级。

## Migration Plan

1. 先增加向后兼容的 shared types/channels/schemas 与 main/preload API；现有 read/save 调用保持不变。
2. 增加 knowledge store browser state、传统 `pages/components/utils` 页面实现和 `/knowledge` route，再接入 overview 入口。
3. 运行 main/renderer 聚焦测试、完整 typecheck、lint 和测试套件，并人工检查浅色/深色、窄窗口、空/错/加载、状态 badge、frontmatter 大数组和删除失败。
4. 回滚时移除新增 route、browser/delete channel 和入口即可；没有数据迁移，既有 knowledge 文件保持原样。

## Open Questions

无。页面定位、布局、只读策略、frontmatter 展示和删除确认均已由用户确认。
