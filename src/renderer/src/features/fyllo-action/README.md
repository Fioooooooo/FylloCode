# Fyllo Action

状态： actively migrating from scattered renderer directories into this feature.

## 范围

- Fyllo Action 在 Renderer 侧的解析、展示、执行、注册和提醒聚合。
- 包括 Inline Action UI（Markstream 节点）、EventRail contributor、session attention 计数。
- 包括 Action 执行时的临时运行状态（running/retrying/sync-failed）和 durable 副作用编排。

## 非范围

- Action 的跨进程协议、schema、状态机、registry 和 prompt 定义在 `src/shared/fyllo-action/`。
- Action 状态持久化、幂等注册和合法迁移由 Main 的 `src/main/services/session/action/` 负责。
- 通用 Markdown/Markstream 解析宿主仍属于 `src/renderer/src/components/shared/markstream/`。
- Chat Event Rail 的通用宿主聚合器属于 `src/renderer/src/features/chat-event-rail/`。

## 公开入口

- `@renderer/features/fyllo-action`：稳定公共 API，包括 selectors、`useSessionAttention`、`FylloActionShell`、`FylloActionNode` 等。
- Markstream 装配入口：`@renderer/features/fyllo-action/integration/markstream`
- EventRail contributor 入口：`@renderer/features/fyllo-action/integration/event-rail`
- Renderer UI override registry：`@renderer/features/fyllo-action/integration/renderer-registry`

## 四层结构

| 层             | 职责                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `model/`       | 纯状态投影、selector、attention 计数；不依赖 Vue/Pinia/IPC/宿主 DTO。                                      |
| `application/` | Action 注册 controller、执行 controller、执行 runtime、typed handlers、依赖 ports；不包含 SFC 和宿主 DTO。 |
| `ui/`          | Vue SFC，展示 parse 状态与持久化状态，收集 confirm/cancel/retry 意图；不直接调用 IPC 或 durable 副作用。   |
| `integration/` | Markstream adapter、EventRail contributor、renderer registry override、与 Chat host 的 composition root。  |

## 依赖方向

- `model` → `@shared/fyllo-action/*`
- `application` → `model` + `@renderer/api/session/action` + ports
- `ui` → `model`/`application` + shared types
- `integration` → `ui`/`application`/`model` + 宿主（Markstream/EventRail）contract
- feature 外部默认只从 `index.ts` 导入；host 装配可从 integration entry 导入。
