---
name: Renderer Feature Architecture
description: Governs capability-oriented renderer feature boundaries, semantic layers, public entry points, dependency flow, and incremental migration.
keywords: [renderer, features, architecture, boundaries, vue]
---

# Renderer Feature Architecture

## 范围

- 覆盖：`src/renderer/src/features/**`，以及准备从 `components/`、`composables/`、`utils/`、局部 `config/` 迁入 feature 的能力专属代码。
- 不覆盖：route、renderer API wrapper、Pinia store、bootstrap 的固定位置和 domain 规则；这些继续遵守 `guidelines/RendererProcess.md`。
- 不覆盖：跨进程协议和共享 schema；这些继续放在 `src/shared/**` 并遵守 `guidelines/Architecture.md` 与 `guidelines/MainProcess.md`。
- 不覆盖：视觉 token、交互和可访问性规范；feature UI 仍须遵守 `guidelines/UiDesign.md`。

本结构是 Renderer 进程面向复杂能力的渐进式演进方向。现有技术目录不要求一次性搬迁；新复杂能力和已批准的能力重组应优先建立 feature 边界，并按独立变更逐步迁移。首个已确认采用该结构的能力是 `references/fyllo-action/README.md` 中的 Fyllo Action 整改方向。

## Feature 准入与边界

- MUST 以可独立描述的用户能力或业务用例命名 feature，例如 `fyllo-action`、`workflow-editor`、`chat-composer`；不得以 `common`、`misc`、`helpers` 等无所有权名称建立 feature。（证据：`references/fyllo-action/README.md`；当前 `src/renderer/src/components/shared/**` 已承担真正的跨功能 UI 原语。）
- MUST 让 feature 拥有自己的交互生命周期、用例编排或纯业务投影。单个通用组件、单个格式化函数、route wrapper、API wrapper 或 store 不得仅为目录一致性被包装成 feature。
- MUST 在 feature 根目录提供 `README.md`，至少说明状态、范围、非范围、当前来源位置、目标边界和迁移触发条件。仅含 README 的目录表示已记录的未来方向，不表示功能已迁移或可从该目录导入。
- MUST 默认通过 `features/<feature>/index.ts` 暴露已实现 feature 的公共 API。feature 外部不得深路径导入其 `model/`、`application/` 或 `ui/` 内部文件；确有 bundling、循环依赖或宿主注册需求时，可增加 README 明确列出的 integration entry point。
- SHOULD 让 route 页面保持薄层，只负责路由参数、页面级布局和 feature 挂载。文件系统路由仍必须位于 `src/renderer/src/pages/`。（证据：`guidelines/RendererProcess.md` 的路由规则。）

## 四层语义

复杂 feature 使用以下统一语义。目录按实际需要创建，不要求空目录占位。

| 层             | 回答的问题                 | 允许内容                                                                                  | 禁止内容                                                 |
| -------------- | -------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `model/`       | 什么状态成立、如何纯计算   | feature 类型、纯状态、selector、纯 parser/projector、不可变转换                           | Vue、Pinia、overlay、API/IPC、SFC、宿主 DTO              |
| `application/` | 用户意图发生后下一步做什么 | use case、controller、command handler、ports、异步编排、用例级 composable                 | Vue SFC、Markstream/EventRail 等宿主实现、展示文案与组件 |
| `ui/`          | 如何展示状态并收集用户意图 | Vue SFC、展示映射、仅服务 UI 的 reactive hook                                             | IPC/API 编排、持久化、durable 副作用、跨 feature 流程    |
| `integration/` | 如何连接宿主或第三方系统   | Markstream adapter、EventRail contributor、overlay/route/bootstrap 注册、composition root | 核心状态规则、domain 持久化和业务副作用实现              |

- MUST 按职责而不是代码形态放置文件。`use...` composable 可以属于 application、ui 或 integration；其位置由它编排的责任决定，而不是统一放入 `composables/`。
- MUST NOT 在 feature 内建立泛化的 `utils/`。纯函数应按领域责任命名，例如 `selectors.ts`、`identity.ts`、`pending-actions.ts`、`command-selection.ts`。
- MUST NOT 机械增加 `ui/components/`、`application/composables/`、`model/utils/`。`ui/` 已表达组件所有权；只有 `handlers/`、`actions/`、`markstream/` 等能表达稳定业务变体或集成边界的目录才应继续分组。
- SHOULD 将只服务单个 UI 单元的 hook 与该 UI 相邻；当 hook 开始执行用例、访问状态端口或协调副作用时，迁入 application。

## 调用顺序与依赖规则

标准交互路径是：

```text
route / host
    -> integration
    -> ui
    -> application
    -> model
    -> application port
    -> renderer store / API wrapper
    -> application result
    -> ui render
```

- MUST 让 `model/` 保持纯净，只依赖同 feature 的纯模型文件、标准库和可安全复用的 `@shared` 纯契约；不得导入 Vue、Pinia、`@renderer/stores`、`@renderer/api`、UI 或 integration。
- MUST 让 `application/` 依赖 model 和明确的 ports，不得依赖 UI SFC 或 integration 的宿主 DTO。Renderer 专属的简单用例 composable 可以从 `@renderer/stores` 根 barrel 组合 store，但可复用、需要幂等/重试或包含 durable 副作用的流程 SHOULD 通过 ports 注入依赖以便隔离测试。（证据：`guidelines/RendererProcess.md` 的 store public entry 与流程所有权规则。）
- MUST 让 `ui/` 通过 props、emits 或 application API 收集意图并渲染状态，不得直接访问 `window.api`，不得直接实现持久化或重复执行 application handler。简单只读状态可从公开 store 获取；包含流程判断时必须下沉 application。
- MUST 将 `integration/` 视为最外层 adapter。它可以装配 feature 的 model/application/ui 并依赖宿主 contract；model、application 和 ui 不得反向导入 integration。
- MUST 保持跨 feature 依赖单向并经过目标 feature 的公开入口。两个 feature 不得互相深路径导入；出现双向依赖时，应把流程编排放入拥有该用户用例的 feature/integration，或将真正通用的稳定原语提升到现有 shared 层。
- MUST 继续把 renderer API wrapper 放在 `src/renderer/src/api/<domain>/<area>.ts`，把共享 Pinia 状态放在 `src/renderer/src/stores/<domain>/`，把 route 放在 `src/renderer/src/pages/`。feature 可以通过 application/ports 使用它们，但不得复制 IPC wrapper 或建立 feature 私有的第二套 durable store。（证据：`guidelines/RendererProcess.md`；`openspec/specs/domain-architecture-contract/spec.md`。）

## Projection 与运行期状态

- MUST 区分 feature-owned 纯 projection 与宿主展示 DTO。前者放在 model，例如 `Session -> PendingFylloAction[]`；后者在 integration 中转换，例如 `PendingFylloAction[] -> EventRail contributor`。model 不得返回 EventRail、overlay 或具体组件拥有的 DTO。
- MUST 区分领域/持久化状态与 Renderer 运行期控制状态。纯状态枚举、终态谓词和迁移判断放在 model；`running`、`retrying`、`sync-failed` 等控制器生命周期放在 application；局部 hover/open/expanded 状态留在 ui。
- SHOULD 让多个展示入口复用 model selector，不得在 Inline、Rail、badge 等 UI 中分别重写同一状态判定。（证据：`references/fyllo-action/README.md` 中统一 `requiresFylloActionAttention` 与 resolved predicate 的决策。）

## 迁移规则

- MUST 将文件重排与行为变更分开判断。纯目录迁移、等价拆分和 import 调整可按非 contract 变更处理；新增状态、公开接口、默认/空/错误行为或持久化格式时必须按 OpenSpec Proposal 处理。
- MUST 按可验证的完整切片迁移：先建立 feature 公共入口和回归测试，再移动 model/application/ui/integration，更新消费者，最后移除临时 re-export。不得长期同时维护两套实现。
- MUST 同步迁移测试到 `test/renderer/src/features/<feature>/...`，并保持 model/application/ui/integration 的测试边界。API 和 store 测试继续镜像其原 domain 目录。（证据：`guidelines/Testing.md`。）
- SHOULD 在迁移前记录当前来源路径和预期 public API；README 中的未来目录草案不得被生产代码导入。
- SHOULD 为 feature 加入 lint 边界，至少禁止 model 导入 Vue/Pinia/renderer infrastructure、禁止 application 导入 UI/integration、禁止外部深路径导入。边界尚未自动化时，review 必须逐项检查。（证据：`eslint.config.mjs` 已对 renderer API/store 边界使用 `no-restricted-imports`。）

## 命名与公开入口

- MUST 使用 kebab-case feature 目录名；名称应表达能力而非页面技术，例如 `proposal-workbench` 优于 `proposal-page`。
- MUST 使用 PascalCase 命名 Vue SFC；application 文件使用用例或动作名；model 文件使用业务名词或 predicate；integration 文件使用宿主名，例如 `markstream.ts`、`event-rail.ts`。
- MUST 让 `index.ts` 只导出外部消费者需要的稳定 API，不得使用无边界的 `export *` 暴露全部内部文件。
- SHOULD 优先导出 commands、queries、组件入口和必要类型；内部状态容器、临时 DTO、具体 port adapter 不应成为公共 API。

## 验证

文档占位变更至少检查：

```bash
git diff --check
```

实际 feature 迁移按影响范围执行：

```bash
pnpm exec vitest run --project renderer
pnpm typecheck:web
pnpm lint
```

Review 还必须确认：

- feature 外部没有新增内部深路径导入；
- model 没有 Vue、Pinia、API、store 或宿主依赖；
- application 没有 SFC 或宿主 DTO 依赖；
- pages、stores、api 仍遵守 RendererProcess 的固定位置；
- README 状态与实际迁移进度一致。

## 失效信号

- `src/renderer/src/features/**` 的实际结构与四层语义不再一致；
- `guidelines/RendererProcess.md` 调整 pages、stores 或 API wrapper 所有权；
- `eslint.config.mjs` 新增或修改 feature boundary；
- 出现第二套 renderer feature 分层方式；
- Fyllo Action 实施结果证明当前依赖方向或 public entry 约束不可行。
