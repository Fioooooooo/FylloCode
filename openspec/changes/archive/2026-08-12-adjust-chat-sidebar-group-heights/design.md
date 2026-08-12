## Context

`src/renderer/src/components/chat/ChatSidebar.vue` 当前把每个展开的 `UCollapsible` 会话组设置为相同的 `grow`，因此两个组会固定平分 `data-test="session-list"` 容器中标题之外的剩余高度。分组内容由内部 `min-h-0 flex-1 overflow-y-auto` 容器滚动，折叠内容通过 `unmount-on-hide="false"` 保持挂载，以保留滚动位置。

目标布局只改变两个非空分组同时展开时的空间分配，不改变分组数据、顺序、折叠状态或会话操作。

## Goals / Non-Goals

**Goals:**

- 两组同时展开时，让置顶组按标题和会话条目的实际内容高度收缩，并限制其总高度不超过会话列表可用高度的 50%。
- 让最近组使用置顶组之后的剩余空间，并保持两个组各自的溢出滚动。
- 保持仅一个组展开或存在时，该展开组占用全部剩余高度。

**Non-Goals:**

- 不改变置顶/取消置顶、组内排序、active Session 自动展开或折叠状态生命周期。
- 不引入拖拽调整分组高度、持久化高度偏好或新的响应式断点。
- 不改变 `SessionItem.vue` 的尺寸、内容和交互。

## Decisions

### 1. 置顶组是受限的自然高度区域，最近组是剩余空间区域

在两个非空组都展开时，置顶 `UCollapsible` 使用按内容计算的自然高度，并设置 50% 最大高度；最近 `UCollapsible` 保持可增长且 `min-h-0`，吸收剩余空间。置顶内容超过上限时，复用现有内部 `overflow-y-auto` 容器滚动。

选择这一方式是因为用户要解决的是少量置顶会话浪费一半空间，同时仍需保证最近会话始终有至少一半空间。相比让两个组都设置 50% 上限，这一方案不会在置顶组较短而最近会话较多时留下无法使用的空白。

### 2. 根据分组身份与展开组合显式计算布局 class

`ChatSidebar.vue` 继续以 `sessionGroups` 与 `groupOpenById` 为状态来源，并在模板 class 绑定中显式区分三种状态：

- 两组同时展开：置顶组自然高度且 `max-height: 50%`，最近组增长填充剩余空间。
- 仅一个组展开：展开组增长填充剩余空间，折叠组只保留现有标题高度。
- 仅一个非空组存在：该组增长填充剩余空间。

不使用 CSS sibling selector 推导相邻组状态，避免布局行为依赖 Nuxt UI 渲染的内部 DOM；也不读取或测量条目像素高度，避免引入 `ResizeObserver` 和运行时尺寸状态。

### 3. 保留滚动容器与折叠挂载策略

继续保留每组内容区的 `min-h-0 flex-1 overflow-y-auto` 和 `unmount-on-hide="false"`。因此置顶组触及 50% 上限后仍独立滚动，折叠再展开仍由同一个 DOM 节点保留滚动位置。

## Risks / Trade-offs

- [Risk] Nuxt UI `UCollapsible` 的 wrapper class 与内容区 flex 组合可能让自然高度无法按预期收缩。→ 通过 renderer 组件测试断言布局 class，并在窄窗口与桌面窗口中人工验证少量/大量置顶会话组合；不覆盖 Nuxt UI 内部结构。
- [Trade-off] 最近组在两组展开时可能超过 50%，这与“最近组使用剩余空间”的选择一致，并优先提升常用历史会话的可视面积。
- [Risk] 分组折叠切换时 flex-grow 过渡可能产生短暂跳变。→ 继续使用现有 `transition-[flex-grow]` 与 `motion-reduce:transition-none`，不新增高度测量动画。

## Migration Plan

该变更仅调整 renderer 布局 class，无数据迁移、依赖升级或回滚步骤。回滚时恢复 `ChatSidebar.vue` 的等分增长 class 及对应测试即可。

## Open Questions

无。
