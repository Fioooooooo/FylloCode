## Why

FylloCode 已能沉淀项目级 durable knowledge，但用户目前只能在 Chat 的 action 审阅流程中接触单个条目，无法从项目治理视角浏览、核查或清理已有知识。需要在 overview 的治理入口补齐独立知识浏览页，使知识沉淀成为与能力规约、变更提案和项目准则并列的可见治理资产。

## What Changes

- 在 overview“治理健康”卡片的三列治理入口网格中增加“知识沉淀”入口，展示知识总数并导航到独立 `/knowledge` 页面；该页面不加入 ActivityBar。
- 新增左侧分组列表、右侧只读正文的知识浏览页，按 `project`、`reference`、`feedback` 分组，并标明 `active`、`suspect`、`unknown` 状态。
- 通过新的 `insight:knowledge` browser IPC 查询复用现有 knowledge scanner，返回条目摘要、computed status 和扫描错误；选择条目后复用现有 raw markdown 读取能力。
- 右侧以 Markdown 渲染完整 knowledge 文件；展示层只将开头的 YAML frontmatter 边界包装为 YAML code block，不解析、重组或修改 frontmatter 字段和数组内容。
- 暴露受校验的单条 knowledge 删除能力；用户必须经过明确的二次确认，删除成功后刷新列表并选择相邻条目，删除失败时保留当前内容和选择。
- 将无法读取或解析的 knowledge 文件作为显式异常项展示，避免损坏条目被静默隐藏。

## Capabilities

### New Capabilities

- `knowledge-browser`: 定义项目 knowledge 的独立双栏浏览、分组与状态展示、完整 Markdown 阅读、扫描异常呈现和二次确认删除行为。

### Modified Capabilities

- `project-overview`: 在治理健康卡片增加知识沉淀摘要和到 `/knowledge` 的导航入口，同时隔离知识摘要加载失败与 overview 主数据状态。

## Impact

- Shared contract：扩展 `src/shared/types/knowledge.ts` 与 `src/shared/ipc/insight/knowledge.*`，新增 browser 查询和删除输入/输出契约。
- Main/preload：扩展 `src/main/services/insight/knowledge/knowledge-document-service.ts`、`src/main/ipc/insight/knowledge.ts`、`src/preload/api/insight/knowledge.ts` 及 preload 类型暴露，复用 `src/main/infra/storage/knowledge.ts` 的 scanner 和安全路径规则。
- Renderer：扩展 knowledge API/store，新增 `/knowledge` 文件系统路由页面，并调整 `OverviewStatsBar.vue` 与 overview 页面装配。
- Tests：增加 main service、IPC、preload、renderer API/store/page 与 overview 交互测试；不引入新依赖，不修改 knowledge 文件存储格式。
