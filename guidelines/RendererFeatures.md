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

- MUST 只让具有复杂功能编排责任的能力进入 `features/**`。至少应存在以下一种准入信号：多个 UI/宿主入口需要共享同一状态投影或交互生命周期；独立状态机、持久化、重试或幂等流程；通过 port/contributor 协调其他 feature；第三方宿主或 overlay/integration 适配；已批准的复杂能力迁移。仅有一个 route、一个 domain store 和少量页面内交互不构成 feature 准入理由。（依据：用户确认的 feature 准入边界；复杂实例见 `src/renderer/src/features/fyllo-action/**`。）
- MUST 让单页面、小规模能力继续使用 `src/renderer/src/pages/**`、`components/**`、`composables/**`、`utils/**` 与既有 domain store/API 的传统 renderer 结构；不得仅因它能被命名为一个用户能力、包含异步读取或拆出多个组件就创建 feature。现有 reader 页面模式见 `src/renderer/src/pages/guidelines.vue`、`src/renderer/src/pages/specs.vue`。（依据：用户确认的小功能落位规则。）
- MUST 以可独立描述的用户能力或业务用例命名 feature，例如 `fyllo-action`、`workflow-editor`、`chat-composer`；不得以 `common`、`misc`、`helpers` 等无所有权名称建立 feature。（证据：`references/fyllo-action/README.md`；当前 `src/renderer/src/components/shared/**` 已承担真正的跨功能 UI 原语。）
- MUST 让已准入的 feature 拥有自己的复杂交互生命周期、跨入口用例编排或被多个宿主复用的纯业务投影。单个通用组件、单个格式化函数、route wrapper、API wrapper、store 或仅服务一个页面的展示投影不得仅为目录一致性被包装成 feature。
- MUST 在 feature 根目录提供 `README.md`，至少说明状态、范围、非范围、当前来源位置、目标边界和迁移触发条件。仅含 README 的目录表示已记录的未来方向，不表示功能已迁移或可从该目录导入。
- MUST 默认通过 `features/<feature>/index.ts` 暴露已实现 feature 的公共 API。feature 外部不得深路径导入其 `model/`、`application/` 或 `ui/` 内部文件；确有 bundling、循环依赖或宿主注册需求时，可增加 README 明确列出的 integration entry point。
- SHOULD 让 route 页面保持薄层，只负责路由参数、页面级布局和 feature 挂载。文件系统路由仍必须位于 `src/renderer/src/pages/`。（证据：`guidelines/RendererProcess.md` 的路由规则。）

## 复杂度自适应结构

本节只用于已经通过上述复杂功能编排准入的 feature；目录结构可以适应实施阶段和职责复杂度，但不得反向用“可以根目录平铺”降低 feature 准入门槛。四层结构是复杂 feature 的完整形态，不是脚手架模板。MUST 只创建当前职责实际存在的层，不得为了目录对称创建空目录或无行为的转发文件。（依据：用户确认的 Renderer feature 演进方向与 feature 准入边界；当前 `src/renderer/src/features/*/README.md` 是未迁移方向，不是四层空实现。）

| 已准入 Feature 的当前形态                          | 推荐结构                                        |
| -------------------------------------------------- | ----------------------------------------------- |
| 渐进迁移首切片，当前只有少量同职责文件             | 根目录平铺，通过 `index.ts` 暴露公共入口        |
| 多入口复用的展示与纯投影                           | `model/` + `ui/`                                |
| 有独立交互生命周期、状态机或异步流程               | `model/` + `application/` + `ui/`               |
| 有宿主、第三方库、overlay、route 或跨 feature 装配 | 按需使用完整 `model/application/ui/integration` |

- MUST 以“能否降低一次需求改动所跨越的目录和所有权数量”判断是否创建 feature；不得只以文件数量或页面名称判断。
- SHOULD 在 feature 出现多个 UI 入口、明确状态机、持久化/重试/幂等、第三方宿主或跨 domain 副作用时使用完整分层。Fyllo Action 同时具备 streaming 生命周期、Action 状态、Inline/Rail/badge 多入口、Markstream 集成和 durable 副作用，因此采用完整四层。（证据：`references/fyllo-action/README.md`。）
- SHOULD 让已通过准入但仍处于渐进迁移首切片的 feature 保持可读的最小结构；当职责增长时再拆层。不得提前创建只有一个 re-export 或空 `index.ts` 的层级，也不得以该最小结构作为新建小型 feature 的理由。
- MUST 将“是否创建 feature”和“feature 内是否使用四层”分开判断。不是所有页面块、组件或 composable 都应成为 feature。

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
- MUST 根据 composable 的责任放置它，而不是根据 `use` 前缀归档：用例级 composable 属于 application，UI-only composable 与组件相邻，第三方/宿主适配 composable 属于 integration。纯计算不得为了使用 Vue reactivity 而包装成 composable，应保留在 model。
- MUST 将 integration 限制为外部 adapter 和装配代码。它不得成为无法归类代码、共享 helper、业务规则或跨 feature 状态的收容目录；无法说明具体宿主名称和适配边界的文件不得进入 integration。

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

## 状态所有权

状态按生命周期和消费者范围确定 owner，不按“是否 reactive”决定位置。每份状态必须只有一个事实源，其他入口通过 selector、query 或 projection 消费。

| 状态类型                            | Owner                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- |
| 跨进程或 durable 状态               | Main/shared contract 与既有 renderer domain store；feature 不复制持久化副本 |
| 跨页面、跨组件复用的领域/流程状态   | `stores/<domain>/`，遵守 `RendererProcess.md` 的 store 边界                 |
| 单 feature 的运行期 controller 状态 | `application/`，例如 running、retrying、sync-failed                         |
| 纯派生状态和业务谓词                | `model/` selector，不另存可变副本                                           |
| 单组件或单 UI 单元状态              | `ui/`，例如 open、hover、expanded、输入草稿                                 |

- MUST NOT 因为多个组件需要读取某个值就立即新增 Pinia store；先判断它是否能由 model selector 派生，或是否只属于一个 feature controller。
- MUST NOT 在 feature 内复制 domain store 已拥有的 durable/共享状态。Feature application 可以组合公开 store，但 feature 私有状态不得反向成为另一个 feature 的事实源。
- MUST 让状态修改经过拥有该状态的 action/controller；多个 UI 入口不得分别实现同一状态迁移。
- SHOULD 让 feature-local controller 在宿主卸载时释放 watcher、subscription、DOM listener、in-flight request 和临时缓存；需要跨页面保留时才提升到 domain store。

## 跨 Feature 协作

Feature 之间可以协作，但依赖必须单向、显式并经过公共契约。两个 feature 的 application 互相调用、彼此读取内部 store 或深路径导入，均视为边界错误。出现双向依赖时，优先判断编排所有权，而不是用 barrel、动态 import 或回调隐藏循环。（依据：用户确认的 Renderer feature 演进规则；未来候选边界见 `src/renderer/src/features/*/README.md`。）

### 依赖方式选择

| 需求                           | MUST/SHOULD 使用                                                          | 禁止或避免                                                        |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 使用另一个 feature 的稳定能力  | MUST 从目标 feature 的 `index.ts` 或 README 声明的 integration entry 导入 | MUST NOT 深路径导入目标的 model/application/ui 内部文件           |
| 请求另一个 feature 执行动作    | SHOULD 由 consumer 定义 port，在 composition root 注入 provider           | application 直接导入对方 handler、store 或 UI                     |
| 聚合多个 feature 的展示        | MUST 由 route、host 或 integration composition root 装配                  | 两个来源 feature 的 UI/application 互相 import                    |
| 共享领域状态                   | MUST 复用既有 domain store、renderer API wrapper 或 `@shared` contract    | 把某个 feature 的内部状态当作全局状态入口                         |
| 接收异步 occurrence 或提醒来源 | SHOULD 使用 typed contributor/event contract，并在宿主注册                | 无类型全局 event bus、通过当前 active state 反推来源              |
| 依赖形成环                     | MUST 提升编排层、重新确定 owner 或抽取已有架构层可承载的稳定契约          | 创建 `features/shared`、`features/common` 或 `utils` 收容循环依赖 |

### 公共入口

- MUST 让外部消费者使用 `@renderer/features/<feature>` 对应的根入口；不得使用 `@renderer/features/<feature>/model/**`、`application/**`、`ui/**` 深路径。当前 README-only 占位没有 `index.ts`，不得被生产代码导入。
- MUST 只从 `index.ts` 导出稳定的 command、query、组件入口和必要类型；内部状态容器、具体 port adapter、宿主 DTO 和临时 selector 不得成为公共 API。
- SHOULD 让跨 feature 的直接 import 发生在 integration、route 或其他明确的 composition root。UI 只有在组合对象是目标 feature 明确公开且稳定的视觉入口时才可直接导入。

示例：

```ts
// ✅ 公开入口
import { ProposalWorktreeBadge } from "@renderer/features/proposal-workbench";

// ❌ feature 内部深路径
import ProposalWorktreeBadge from "@renderer/features/proposal-workbench/ui/ProposalWorktreeBadge.vue";
```

### Consumer-owned Port

当 feature A 需要 feature B 执行动作时，A 的 application SHOULD 定义完成自身用例所需的最小 port；B 或宿主提供实现，composition root 负责连接。Port 归 consumer 所有，因为接口描述的是 consumer 的需求，不是 provider 的全部能力。

```ts
// task-board/application/ports.ts
export interface OpenChatPort {
  openFromTask(taskId: string): Promise<void>;
}
```

```ts
// route/host 或 task-board integration
createTaskBoardController({
  openChat: chatSessionIntegration.openFromTask,
});
```

- MUST 让 application 只看到 port 和用例输入/输出，不得看到 provider 的 Pinia store、SFC、route 或 overlay 实现。
- SHOULD 在需要测试隔离、重试、幂等、durable 副作用或 provider 可替换时使用 port；简单只读 domain 状态仍可按 `RendererProcess.md` 从公开 store barrel 获取。
- MUST 在 integration/composition root 创建 controller 或绑定 port；model 和 ui 不得承担依赖注入。

### 宿主聚合与 Contributor

多个 feature 向同一个宿主区域提供内容时，宿主 feature 拥有通用 contributor contract，来源 feature 在自己的 integration 中实现该 contract，最外层 host 负责注册。宿主核心不得枚举或导入具体来源 feature。

以 Chat Event Rail 为目标边界：

```text
Chat host
  ├─ create chat-event-rail
  ├─ create Fyllo Action contributor
  ├─ create Proposal contributor
  └─ register contributors into rail
```

- `chat-event-rail` 公开稳定的 `EventRailContributor` contract；
- `fyllo-action/integration/event-rail.ts` 只把 `PendingFylloAction[]` 转换为 contributor；
- `proposal-workbench/integration/event-rail.ts` 只转换 proposal projection；
- Chat host 同时导入三个公共入口并完成装配；
- Event Rail 核心不导入 Fyllo Action 或 Proposal，来源 feature 也不导入 Rail 内部 UI。（规划依据：`src/renderer/src/features/chat-event-rail/README.md` 与 `references/fyllo-action/README.md`。）

Contributor/event contract MUST 使用判别联合或其他可穷尽的 typed contract。事件表达已经发生的 occurrence；要求另一个 feature 执行动作时仍应使用 command/port，不得用 event 伪装命令。

### 共享数据与共享 UI

- MUST 区分“共享同一份领域数据”和“依赖另一个 feature”。如果两个 feature 都需要 provider connection、session 或 proposal 状态，应分别通过现有 domain store/API/shared contract 获取，而不是让其中一个 feature 暴露内部状态给另一个。（规划例：`project-integrations` 与 `provider-connections` 均依赖 platform provider domain，但彼此不依赖。）
- MUST NOT 为跨 feature 复用创建第二套 durable store。共享可复用异步状态继续归 `stores/<domain>/`，跨进程类型继续归 `src/shared/**`。
- SHOULD 只把语义中立且确有多个消费者的视觉原语提升到 `components/shared/**`。包含某个 feature 业务词汇、用例状态或 handler 的组件不得提升为 shared UI。
- MUST NOT 创建 renderer feature 专用的 `features/shared`、`features/common` 或跨 feature `utils`。无法确定 owner 的代码应先重新判断用例所有权；只有满足既有 shared/store/API 职责时才提升到对应现有层。

### 分层允许矩阵

| 当前层        | 跨 feature 规则                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `model`       | MUST NOT 依赖其他 feature；跨边界稳定领域类型来自 `@shared`，或在 application/integration 边界转换 |
| `application` | SHOULD 通过 consumer-owned port；不得导入对方 UI、store 实现、handler 或 integration               |
| `ui`          | SHOULD 由宿主组合；只可从对方公共入口使用明确公开的稳定 UI，不得读取其内部状态                     |
| `integration` | MAY 依赖其他 feature 的公共入口，并负责 port binding、contributor 注册与宿主装配                   |
| route / host  | MAY 组合多个 feature，但 MUST NOT 承载业务判定、状态机或 durable 副作用                            |

### 循环依赖处理顺序

发现 `A -> B -> A` 时必须按以下顺序处理：

1. 判断哪个 feature 拥有完整用户流程，把跨 feature 编排移到 owner 的 integration；
2. 没有单一 owner 时，把装配提升到 route、Chat host 或其他明确的 composition root；
3. 只是共享领域状态时，让双方依赖现有 domain store/API/shared contract；
4. 只是 UI 原语复用时，在确认语义中立和多消费者后提升到 `components/shared`；
5. 只是异步来源聚合时，定义 typed contributor/event contract，由 host 注册；
6. 如果仍无法消除循环，停止迁移并重新评估 feature 边界，不得通过 re-export、全局 event bus 或 service locator 绕过。

## Projection 与运行期状态

- MUST 区分 feature-owned 纯 projection 与宿主展示 DTO。前者放在 model，例如 `Session -> PendingFylloAction[]`；后者在 integration 中转换，例如 `PendingFylloAction[] -> EventRail contributor`。model 不得返回 EventRail、overlay 或具体组件拥有的 DTO。
- MUST 区分领域/持久化状态与 Renderer 运行期控制状态。纯状态枚举、终态谓词和迁移判断放在 model；`running`、`retrying`、`sync-failed` 等控制器生命周期放在 application；局部 hover/open/expanded 状态留在 ui。
- SHOULD 让多个展示入口复用 model selector，不得在 Inline、Rail、badge 等 UI 中分别重写同一状态判定。（证据：`references/fyllo-action/README.md` 中统一 `requiresFylloActionAttention` 与 resolved predicate 的决策。）

## 迁移规则

- MUST 将文件重排与行为变更分开判断。纯目录迁移、等价拆分和 import 调整可按非 contract 变更处理；新增状态、公开接口、默认/空/错误行为或持久化格式时必须按 OpenSpec Proposal 处理。
- MUST 按可验证的完整切片迁移：先建立 feature 公共入口和回归测试，再移动 model/application/ui/integration，更新消费者，最后移除临时 re-export。不得长期同时维护两套实现。
- MUST 同步迁移测试到 `test/renderer/src/features/<feature>/...`，并保持 model/application/ui/integration 的测试边界。API 和 store 测试继续镜像其原 domain 目录。（证据：`guidelines/Testing.md`。）
- SHOULD 在迁移前记录当前来源路径和预期 public API；README 中的未来目录草案不得被生产代码导入。
- MUST 由 `renderer-features/boundaries` 强制 feature 边界：禁止 model 导入 Vue/Pinia/renderer infrastructure、禁止 application 导入 UI/integration、禁止外部深路径导入，并要求公共入口显式导出稳定符号。（证据：`scripts/eslint-rules/renderer-feature-boundaries.mjs`、`eslint.config.mjs`、`test/main/scripts/renderer-feature-boundaries.spec.mjs`。）
- MUST 让 feature lint 规则基于目录语义和通用 import pattern，例如 `features/*/model/**`，不得把 `fyllo-action`、具体组件名或某个迁移文件写入规则。新增 feature 应自动受到同一规则约束，不需要修改 ESLint 配置。
- MUST NOT 通过具体文件 ignore、feature 名称白名单或按文件例外绕过四层依赖。若通用规则无法表达合法依赖，应先调整公共入口、port 或 composition root；确需修改规则时，修改的仍必须是可适用于所有 feature 的语义规则。
- SHOULD 由 lint 自动阻止 feature 外部深路径导入、model 的框架/infrastructure/跨 feature 依赖，以及 application 对 UI/integration/SFC 的反向依赖；循环依赖、状态所有权和 contributor 语义仍需测试与 review 补充。

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
- 跨 feature import 只指向目标公共入口，没有 model/application/ui 深路径导入；
- application 间协作通过明确 port 或 composition root，不存在循环依赖；
- contributor/event contract 有类型且由宿主注册，没有无类型全局 event bus；
- pages、stores、api 仍遵守 RendererProcess 的固定位置；

## 失效信号

- `src/renderer/src/features/**` 的实际结构与四层语义不再一致；
- `guidelines/RendererProcess.md` 调整 pages、stores 或 API wrapper 所有权；
- `eslint.config.mjs` 新增或修改 feature boundary；
- 出现第二套 renderer feature 分层方式；
- Fyllo Action 实施结果证明当前依赖方向或 public entry 约束不可行。
