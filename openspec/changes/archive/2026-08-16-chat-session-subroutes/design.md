## Context

当前 Chat 的进入点与会话选择主要由 `useOpenChatSession()` 和 `sessionStore.selectSession()` 协同完成，但 URL 只区分 `/chat`，无法表达“当前正在看哪个会话”。任务页、搜索结果和 lineage 页面都复用同一打开会话入口，因此这次变化会同时影响导航、草稿态初始化、首次提交后 URL 升级和失效路由回退。

## Goals / Non-Goals

**Goals:**

- 把 `/chat` 和 `/chat/:sessionId` 分成两个清晰入口。
- 让真实会话可直接通过 URL 访问、恢复和分享。
- 保留 `/chat` 作为草稿/Probe 入口。
- 让任务页、搜索页和 lineage 页继续通过统一打开会话入口工作。
- 让首条消息创建新会话后，页面 URL 自动升级到真实会话子路由。
- 会话无效或不在当前 Workspace 时，回退到 `/chat` 并给出 toast。

**Non-Goals:**

- 不改变会话持久化结构。
- 不改变消息流、Probe 生命周期或 ACP 交互协议。
- 不引入新的页面级错误页。
- 不把路由控制分散到多个业务组件中。

## Decisions

### 1. 用两条页面路由表达两种进入态

将 `/chat` 视为草稿态，把 `/chat/:sessionId` 视为真实会话态。这样路由本身就能表达当前上下文，避免把“是否在看某个会话”藏在 store 里。

备选方案是继续只用 `/chat`，再用 query 或 store 标记会话 ID。该方案会让 URL 失去可读性，也不利于刷新、回退和复制链接，因此不采用。

### 2. 统一打开会话入口仍然是唯一导航适配层

`useOpenChatSession()` 继续作为任务页、搜索页和 lineage 页的共享打开入口，但它不再先跳到 `/chat` 再依赖后续选中，而是直接负责进入目标会话子路由。

备选方案是让各调用方自己拼路由。那会把导航规则散落到多个入口，后续路由调整时更容易漏改，所以不采用。

### 3. 失效会话回退到 `/chat` 并 toast

当目标会话不存在、已删除或不属于当前 Workspace 时，直接回退到 `/chat` 比单独做一个“会话不存在”页面更轻。这里的失败本质是恢复失败，不是一个新的用户任务，因此 toast 足够。

备选方案是新增错误页。那会增加一条新的视觉和导航契约，但不会改善实际恢复路径，所以不采用。

### 4. 首次提交成功后用 URL 升级承载真实会话

首条消息创建出新 Session 后，不立即在创建前改路由，而是在首条 user message durable append 成功后再把 URL 切换到 `/chat/:sessionId`。这样可以避免把“半成品会话”暴露到历史记录里。

备选方案是在 createSession 成功后立刻改 URL。那会让附件保存或首条消息持久化失败时出现错误的可见会话地址，因此不采用。

### 5. 首发升级使用 replace，显式打开会话使用 push

从 `/chat` 草稿态首次提交成功后，URL 升级到新 Session 子路由时使用 `replace`，避免把已经消费掉的临时草稿入口留在历史栈。用户从任务页、搜索结果、lineage 页或侧栏显式打开已有会话时使用 `push`，保留“用户主动打开另一个会话”的导航历史。

删除当前 active Session 后，Renderer 清空 active selection 并回到 `/chat` 草稿入口；即使仍有其他可用会话，也不自动打开另一个会话。

## Risks / Trade-offs

- [路由与 store 同步循环] 路由变化可能再次触发选中逻辑。→ 通过单向入口和明确的 route-to-store / store-to-route 分工控制。
- [无效 session 链接的历史兼容] 旧链接或被删除会话仍可能被打开。→ 统一回退到 `/chat` 并提示，不新增错误页。
- [首发后 URL 升级时机] 过早切换会暴露未完成会话。→ 等待首条 durable append 成功后再更新。
- [浏览器返回行为] push / replace 语义会影响回退体验。→ 首发升级用 replace，显式打开已有会话用 push。

## Migration Plan

1. 先落地 `/chat` 与 `/chat/:sessionId` 的页面路由和共享聊天壳。
2. 再把 `useOpenChatSession()` 改成统一打开真实会话子路由。
3. 然后同步任务页、搜索页、lineage 页和首发消息后的 URL 升级逻辑。
4. 最后补齐相关测试，验证草稿进入态、有效会话进入态、失效回退和首发后升级。

## Open Questions

无。
