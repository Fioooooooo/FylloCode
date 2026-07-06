## Context

当前 overview 静态治理区的 StatsBar 展示能力规约、归档提案和项目准则三项统计。能力规约卡片导航到 `/specs`，归档提案卡片导航到 `/proposal`，项目准则卡片是非交互元素，renderer 测试也断言点击它不会导航。

项目已有一套准则元数据扫描能力：`src/main/infra/guidelines/scan-guidelines.ts` 复用 `src/mcp-servers/fyllo-cortex/src/utils/scan-guidelines.ts`，递归读取 `guidelines/**/*.md`，抽取 frontmatter 中的 `name`、`description`、`keywords` 和 `parseError`。系统提醒和 MCP `guidelines` 工具都依赖这套扫描规则。overview 的 `countGuidelines()` 当前只读取 `guidelines/` 顶层文件，和这套递归口径不一致。

## Goals / Non-Goals

**Goals:**

- 在 renderer 中新增 `/guidelines` 只读页面，让用户从 overview 的“项目准则”卡片进入准则浏览体验。
- 通过主进程读取当前项目的 `guidelines/**/*.md`，返回可直接渲染的准则元数据和正文。
- 让准则元数据与系统提醒/MCP guidelines 工具复用同一套 frontmatter 解析规则。
- 将 overview 的项目准则数量统计口径同步为递归 `guidelines/**/*.md`。
- 保持现有 `/specs` 和 `/proposal` 导航语义不变。

**Non-Goals:**

- 不提供 guideline 创建、编辑、删除、重命名或维护入口。
- 不调用 `mcp__fyllo_cortex__guidelines` 作为页面数据源；页面数据应来自应用主进程 service 和 IPC。
- 不新增 ActivityBar 顶层导航项；入口来自 overview StatsBar。
- 不改变 guideline 文件 frontmatter schema，仅消费现有 `name`、`description`、`keywords` 和 parse error 信息。

## Decisions

### 1. 新增 `guidelines:getBrowser` 读取完整浏览数据

新增 shared channel `GuidelinesChannels.getBrowser = "guidelines:getBrowser"`，通过 `src/main/ipc/guidelines.ts` 注册 handler。handler 校验 `{ projectId }` 后使用 `loadProject()` 获取项目路径，再调用 main service。

理由：renderer 不能直接读文件，且现有跨进程能力都通过 shared channel、schema、main IPC、preload API、renderer API wrapper 串联。新增独立 guidelines API 比复用 MCP guidelines 工具更符合应用层边界。

备选方案：只在 overview 返回 `recentGuidelines` 并复用该数据渲染页面。放弃原因是 overview 数据只包含最近更新摘要，不包含完整列表、正文、frontmatter parse error 和递归浏览所需内容。

### 2. 复用 `scanGuidelines()` 作为列表元数据来源

main service 应调用 `scanGuidelines(projectPath)` 获取 `path`、`name`、`description`、`keywords` 和 `parseError`，再按每个 entry 的 `path` 读取正文和 `stat.mtime`。

理由：系统提醒、MCP guidelines 工具和页面应使用同一 frontmatter 解析口径。这样未来 frontmatter 规则变化时只需要维护一套扫描逻辑。

备选方案：在 guidelines browser service 中重新解析 YAML frontmatter。放弃原因是会产生第二套解析逻辑，容易和 injected guidelines index 不一致。

### 3. 正文返回时去除 YAML frontmatter

guidelines browser service 应返回不含 YAML frontmatter 的 Markdown 正文；frontmatter 元数据通过结构化字段返回。frontmatter parse error 不应阻止文件出现在列表中，页面应展示 parse error 提示并继续显示正文。

理由：`MarkStream` 用于正文阅读，展示 YAML frontmatter 会重复 name/description/keywords，并降低阅读体验。parse error 属于单个 guideline 的质量信息，不应导致整个页面失败。

备选方案：保留完整 Markdown 文件内容。放弃原因是页面已经有结构化元数据区，重复展示 frontmatter 会让读者误以为 frontmatter 是准则正文。

### 4. `/guidelines` 使用与 `/specs` 类似的列表详情布局

页面使用 `src/renderer/src/pages/guidelines.vue` 文件路由。左侧列表只展示 guideline 文件名，避免在导航区重复展示描述和路径；右侧详情展示标题、标题右侧紧邻的关键词、描述、路径、最近更新时间和 Markdown 正文。默认选择第一条 guideline，用户点击列表项切换详情。

理由：`/specs` 已经建立了治理文档的列表详情阅读模式，复用该模式符合现有 UI guideline，也减少用户学习成本。项目准则由用户在本项目内维护，左侧用文件名足以识别目标文档，完整元数据放在详情区更清晰。

备选方案：做成单列文档目录。放弃原因是准则属于多文档集合，单列会让列表、元数据和正文混杂，无法快速切换。

### 5. overview 准则统计改为递归口径

`countGuidelines(projectPath)` 应统计 `guidelines/**/*.md`，并和 `scanGuidelines()` 的文件集合保持一致。overview StatsBar 的“项目准则”点击后导航 `/guidelines`，并显示 arrow affordance；能力规约和归档提案现有导航不变。

理由：同一个数字点击后进入的页面必须展示同一口径的数据，否则用户会看到 StatsBar 数量和页面列表数量不一致。

备选方案：页面只展示顶层 `guidelines/*.md`。放弃原因是项目 guideline 扫描工具已经支持子目录，且用户明确要求本次一并统计子目录。

## Risks / Trade-offs

- 递归扫描大型 `guidelines/` 树可能增加读取成本 → 该目录规模通常较小，先使用一次性读取；如后续出现性能问题，再增加分页或缓存。
- Node 版本的 `fs.readdir({ recursive: true })` 行为需要和现有扫描工具保持一致 → 复用现有 `scanGuidelines()`，overview count 可直接基于扫描结果数量或实现等价递归测试。
- 单个文件读取失败可能影响页面完整性 → service 应把不可读文件作为单项 `parseError` 或 read error 呈现，不让整个列表加载失败，除非根目录扫描发生非 ENOENT 异常。
- 新增页面会引入 Markdown 内容渲染风险 → renderer 复用已有 `MarkStream`，不新增 HTML 注入路径。
