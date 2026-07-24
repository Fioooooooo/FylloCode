## Context

`ChatSidebar.vue` 当前分别渲染置顶和最近会话：置顶组使用 `max-h-1/2 shrink-0`，最近组使用 `flex-1`。没有置顶会话时，最近会话退化为无标题的普通滚动列表。该结构把分组数量和高度策略写死在模板分支中。

项目已经依赖 `@nuxt/ui` 4.9，可直接使用 `UCollapsible`。会话的事实源继续由 `useSessionStore()` 提供，其中 `activeSession` 能判断当前用户正在查看的会话；折叠状态只是 `ChatSidebar` 的局部 UI 状态，不应进入 Pinia store 或持久化层。

## Goals / Non-Goals

**Goals:**

- 将非空的置顶、最近会话统一投影为数据驱动的可折叠分组。
- 默认展开所有分组，并让展开分组等分折叠标题之外的剩余高度。
- 只在 active 会话所属分组从“无 active”变为“有 active”时自动展开目标组，保留其他组的用户选择。
- 折叠时保持列表 DOM 挂载，使滚动位置和 `SessionItem` 局部状态不因卸载丢失。
- 保持分组标题、数量、展开状态和键盘操作可访问。

**Non-Goals:**

- 不实现归档会话、归档数据字段或第三个实际分组。
- 不持久化折叠状态，不跨 `ChatSidebar` 挂载周期恢复用户选择。
- 不提供拖拽调高、手动排序、底部固定标题或分组虚拟列表。
- 不修改 session store、IPC、共享类型或会话排序规则。

## Decisions

### 使用多个 `UCollapsible`，而不是一个 `UAccordion`

在 `ChatSidebar.vue` 内定义局部 `SessionGroupId`、`SessionGroup` 类型和 `sessionGroups` 计算属性，按稳定顺序生成非空的 `pinned`、`recent` 分组，并使用 `v-for` 渲染一个 `UCollapsible`。每个分组通过稳定 ID 读取和更新 `groupOpenById`。

`UCollapsible` 直接提供 disclosure trigger、`aria-expanded` 和键盘行为，也允许根节点参与侧栏的 flex 高度计算。`UAccordion type="multiple"` 虽然能同时展开多项，但其 item/content/body 层级需要额外覆盖才能让每项成为独立的 `flex-1 min-h-0` 容器，且会把会话分组投影耦合到 Accordion 的 items/slot 数据结构。

分组标题使用 Nuxt UI 按钮作为 `UCollapsible` trigger，显示图标、中文标签、会话数量和随展开状态旋转的 chevron。只渲染非空组；最近组即使是唯一分组也保留标题。

### 折叠状态由 `ChatSidebar` 局部拥有

`groupOpenById` 为组件内响应式映射，`pinned` 和 `recent` 初始值均为 `true`。分组暂时消失时保留映射值；非 active 会话使已折叠分组重新出现时，不改写用户选择。组件重新挂载时重新初始化为全部展开。

不把该状态放入 session store，因为它不影响领域数据，也不需要跨页面或跨窗口共享。

### active 分组转换只执行单向展开

从 `sessionStore.activeSession` 和分组 predicate 派生 `activeGroupId`。监听 `activeGroupId`：

- 当值从 `null` 或另一个分组 ID 变为目标 ID 时，将目标组的 `groupOpenById` 设为 `true`。
- 不修改任何其他分组的状态。
- 当用户手动折叠当前 active 会话所在组，而 `activeGroupId` 没有变化时，不重新展开。
- 非 active 会话置顶或取消置顶不会改变 `activeGroupId`，因此目标组保持原折叠状态。

这同时覆盖从草稿首次创建 active 会话、从任务或 lineage 选择其他分组的会话，以及 active 会话置顶状态变化。监听逻辑留在 `ChatSidebar`，不修改 `useSessionStore()`。

### 展开组等分剩余高度

会话列表根容器保持 `flex flex-1 min-h-0 flex-col`。每个分组根节点以固定标题高度作为 `flex-basis`；打开时使用 `flex-grow: 1`，关闭时使用 `flex-grow: 0`，因此：

- 两个组展开时等分可用高度；
- 一个组折叠时只保留固定高度标题，另一个展开组占用其余空间；
- 所有组折叠时标题按 DOM 顺序自然堆叠在顶部；
- 未来存在三个非空组时，三个展开组自然等分剩余高度。

`UCollapsible` content 使用 `flex min-h-0 flex-1 flex-col overflow-hidden`，内部会话列表使用 `min-h-0 flex-1 overflow-y-auto`，保持每组独立滚动。禁用 Nuxt UI 默认的 content 高度动画，避免测量高度与父级 flex 重排叠加；只在分组根节点的 `flex-grow` 上使用 200ms `ease-out` 过渡，使折叠组缩至标题高度的同时由其他展开组平滑接管空间。`prefers-reduced-motion` 下禁用该过渡。

### 折叠内容保持挂载

每个 `UCollapsible` 显式传入 `:unmount-on-hide="false"`。折叠只改变可见性和布局，不卸载 `SessionItem`。这不是后台 stream 的所有权机制——stream 仍由现有 store 管理——但能避免折叠动作重置列表滚动位置及标题编辑、菜单、Popover 等组件局部状态。

## Risks / Trade-offs

- [内容很少的展开组仍占等分高度，可能出现空白] → 这是统一且可扩展的分组规则；用户可折叠不需要的组。
- [三个分组同时展开时单组高度较小] → 当前设计最多考虑置顶、最近、归档三个分组，各组独立滚动；不为尚未存在的更多分组增加复杂布局。
- [保持隐藏 DOM 会增加渲染占用] → 当前会话列表未虚拟化且分组最多三个；若实际会话规模产生性能问题，再以独立变更引入虚拟列表。
- [happy-dom 不计算真实 flex 高度] → 组件测试断言展开状态、类名、独立滚动和 active 转换；浅色/深色及窄窗口的实际等分效果通过人工视觉检查验证。

## Migration Plan

1. 先更新 `ChatSidebar.vue` 的局部分组投影、折叠状态和模板结构。
2. 在 `test/renderer/src/setup.ts` 增加可交互的 `UCollapsible` stub，并更新 renderer 组件测试，覆盖默认展开、独立折叠、active 驱动展开、非 active 跨组不展开和 DOM 保持挂载。
3. 执行 renderer 定向测试与 Web 类型检查，并人工检查两组展开、单组折叠和全部折叠布局。

无需数据迁移。若回滚，只需恢复旧的固定双分组模板和对应测试；session 数据及持久化格式不受影响。

## Open Questions

无。
