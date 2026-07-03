## Why

overview 页面当前以瀑布流顺序展示治理指标、进行中工作、最近脉络和治理演化，信息分层不够清晰，用户需要纵向扫描后才能区分“正在发生的工作”和“项目治理状态”。本变更将页面结构调整为动态数据与静态治理两类区域，使 overview 首屏更容易阅读和决策。

## What Changes

- 将 overview 主内容从单列瀑布结构调整为左宽右窄的双栏结构；窄窗口下可以堆叠，但仍保持动态数据与静态治理的分组顺序。
- 左侧动态数据区域展示“进行中的提案”和“最近脉络”，沿用现有卡片组件与交互能力，并让最近脉络以时间轴方式表达演进顺序。
- 右侧静态治理区域展示“治理健康”“规约增长”“准则演化”。治理健康囊括现有顶部 4 类指标，并突出当前覆盖率；规约增长和准则演化沿用现有信息内容。
- 统一 overview 进行中提案的状态模型：active change 直接暴露非归档 proposal 状态，不再在主进程映射为 overview 专属 stage；renderer 复用 `proposalDisplayStatusConfig` 展示状态 badge。
- 不在 proposal 中约束具体字号、精确间距、像素宽度或单个标题颜色；Apply 阶段应在现有 UI 指南和语义 token 内完成视觉细节。
- 不新增 overview IPC 通道或后端统计字段；只调整 `ProjectOverview.activeChanges` 中提案状态字段的契约。

## Capabilities

### New Capabilities

- `project-overview`: 约束 overview 页面加载项目概览数据后的信息架构、动态/静态分组、进行中提案状态模型、关键交互保留和状态呈现。

### Modified Capabilities

- 无。

## Impact

- 影响 `src/renderer/src/pages/overview.vue`、`src/renderer/src/components/overview/**` 和 `src/renderer/src/utils/proposal-display-status.ts` 的复用点。
- 影响 `src/shared/types/overview.ts` 中 `ActiveChange` 的状态字段，以及 `src/main/services/overview/overview-service.ts` 中 active changes 的状态输出逻辑。
- 需要更新 `test/renderer/src/pages/overview.spec.ts` 和 `test/main/services/overview/overview-service.spec.ts` 覆盖新的结构、既有交互和状态契约。
