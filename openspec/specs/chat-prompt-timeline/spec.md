# chat-prompt-timeline Specification

## Purpose

定义 Chat 长对话中用户 prompt 时间线的投影、紧凑导航、摘要预览、键盘操作、阅读位置同步与资源清理边界；本规范的 SHALL 要求和场景是 Renderer 实现该能力的主要行为契约。

## Requirements

### Requirement: Timeline 保持现有 prompt 投影与显示门槛

Renderer SHALL 按消息原始顺序为每条具有可见文本或附件摘要的 user message 生成一个 timeline item，SHALL 隐藏 system reminder，且 SHALL 仅在已有活动会话、消息加载完成并存在至少两个 item 时展示 timeline。

#### Scenario: 混合消息生成 prompt timeline

- **WHEN** 活动会话包含 user、assistant、system reminder 和附件消息
- **THEN** timeline 仅按原始顺序展示具有可见 user prompt 或附件摘要的 item
- **AND** assistant 内容与 system reminder 不生成 item

#### Scenario: 单个 prompt 不展示 timeline

- **WHEN** 活动会话仅能投影出一个 timeline item
- **THEN** Renderer SHALL 隐藏 timeline

#### Scenario: 消息加载期间不展示 timeline

- **WHEN** 活动会话的消息仍在加载
- **THEN** Renderer SHALL 隐藏 timeline

### Requirement: Timeline 使用紧凑等距的左对齐横线

Renderer SHALL 将 timeline 的可见索引渲染为固定左边缘、均匀纵向分布且数量有界的 neutral 横线导览刻度。存在 2–10 个 timeline items 时，导览刻度 SHALL 与 items 一一对应；超过 10 个 items 时，Renderer SHALL 固定显示 10 个导览刻度并保持 rail 高度不再增长。Renderer SHALL 使用独立 primary/teal thumb 按全部 items 中的 active index 比例表达当前阅读位置，且 active、hover、pointer preview 或 keyboard preview SHALL NOT 改变任何导览刻度的长度、颜色、数量或位置。

#### Scenario: 两到十个 prompt 使用逐项刻度

- **WHEN** timeline 包含 2–10 个 prompt items
- **THEN** Renderer SHALL 为每个 item 渲染一个导览刻度
- **AND** 所有导览刻度使用相同长度、neutral 状态、相同左侧起点和均匀纵向间距
- **AND** rail 高度 SHALL 只在该有界区间内随 item 数量增长

#### Scenario: 超过十个 prompt 固定视觉密度

- **WHEN** timeline 包含超过 10 个 prompt items
- **THEN** Renderer SHALL 只渲染 10 个均匀分布的导览刻度
- **AND** rail SHALL 使用固定最大高度，不因 prompt 总数继续增高
- **AND** rail SHALL NOT 通过自身滚动来暴露额外导览刻度
- **AND** 全部 prompt items SHALL 继续保留在导航数据中

#### Scenario: Active thumb 表达当前阅读位置

- **WHEN** active item 随消息阅读位置改变
- **THEN** Renderer SHALL 按 active item 在完整 timeline items 中的 index 比例移动独立 primary/teal thumb
- **AND** 所有导览刻度 SHALL 保持 neutral、等长且位置不变

#### Scenario: Preview 不改变导览刻度

- **WHEN** 用户 hover、拖动、使用滚轮或键盘预览任意 prompt item
- **THEN** 对应 preview SHALL 只反映在摘要浮层的 selected 状态和无障碍当前值中
- **AND** Renderer SHALL NOT 改变任何导览刻度或 active thumb 的视觉样式来表达 preview

### Requirement: Timeline 指针区域连续命中最近 prompt

Renderer SHALL 让 timeline rail 的整个纵向指针区域按归一化纵向位置映射到完整 timeline items 中的最近 prompt，而不是只让可见导览刻度像素响应指针。映射 SHALL 使用 rail 顶部到当前 pointer 位置的比例乘以 `items.length - 1` 并取最近整数，因此可见刻度之间以及超过 10 个 items 时均 SHALL 不存在无法预览 prompt 的 hover dead zone。

#### Scenario: 指针位于两个导览刻度之间

- **WHEN** 指针在 timeline rail 内移动到两个可见导览刻度之间
- **THEN** Renderer SHALL 根据指针在完整 rail 高度中的纵向比例预览完整 items 中最近的 prompt
- **AND** 摘要浮层 SHALL 跟随该 prompt 更新 selected 摘要
- **AND** 消息列表 SHALL NOT 仅因 hover 发生滚动定位

#### Scenario: 固定十个刻度仍可命中全部 prompt

- **WHEN** timeline 包含超过 10 个 prompt items 且只显示 10 个导览刻度
- **THEN** 指针从 rail 顶部连续移动到底部 SHALL 能依次映射到首个至最后一个真实 prompt index
- **AND** 可见导览刻度 SHALL NOT 被解释为仅有的可导航 items

#### Scenario: 指针拖动扫过 timeline

- **WHEN** 用户在 timeline rail 上按下并纵向拖动指针
- **THEN** Renderer SHALL 按指针经过的归一化位置连续选择最近 prompt
- **AND** 消息列表 SHALL 使用 immediate 滚动定位到当前经过的 prompt
- **AND** pointerup 或 pointercancel 后 SHALL 释放 pointer capture 与拖动状态

#### Scenario: 点击 rail 定位并固定完整列表

- **WHEN** 用户在 rail 上按下并释放且 pointer index 未发生变化
- **THEN** Renderer SHALL 使用标准平滑导航语义定位该 prompt
- **AND** 同一个摘要浮层 SHALL 进入固定完整列表状态

#### Scenario: 滚轮逐条精调 prompt

- **WHEN** 用户将 pointer 保持在 rail 上并滚动滚轮
- **THEN** Renderer SHALL 按滚轮方向将 preview index 逐条增加或减少且限制在 items 边界内
- **AND** 消息列表 SHALL 使用 immediate 语义定位更新后的 prompt

### Requirement: Timeline 使用单一无轮次摘要浮层

Renderer SHALL 为 timeline 使用单一受控摘要浮层，并 SHALL 支持 transient 附近预览与 pinned 完整列表两种状态。Transient 状态 SHALL 最多展示当前 preview prompt 及其相邻 prompt 的五条摘要；pinned 状态 SHALL 展示全部 user prompt 摘要，并在固定最大高度的内容区内提供独立纵向滚动。每条摘要 SHALL 只显示一行，超出可用宽度时 SHALL 使用省略号。浮层 MAY 显示 prompt ordinal、当前位置和 prompt 总数，但 SHALL NOT 展示 assistant 轮次、时间戳或把 prompt ordinal 描述为对话轮次。

#### Scenario: Hover prompt 显示附近五条摘要

- **WHEN** 用户 hover 或键盘预览一个 timeline item 且浮层未固定
- **THEN** Renderer SHALL 打开单一摘要浮层
- **AND** 浮层 SHALL 展示该 item 及其附近最多五条 prompt 摘要
- **AND** 当前 preview 摘要 SHALL 使用浅 primary/teal 背景表示 selected
- **AND** selected 摘要 SHALL NOT 使用左侧深色 border

#### Scenario: 首尾 item 的摘要数量补齐

- **WHEN** 用户预览首个或最后一个 timeline item
- **THEN** transient 浮层 SHALL 从可用的另一侧补齐最多五条摘要
- **AND** 浮层 SHALL NOT 创建不存在的摘要

#### Scenario: 摘要保持单行并省略超长文本

- **WHEN** 任一 user prompt preview 超出摘要行的可用宽度
- **THEN** 摘要行 SHALL 保持单行固定高度
- **AND** 超出内容 SHALL 被截断并使用省略号
- **AND** selected 状态变化 SHALL NOT 导致文字水平位置跳动

#### Scenario: 点击或 Enter 固定完整列表

- **WHEN** 用户点击 rail、点击 transient 摘要或在 rail 上按 Enter
- **THEN** 同一个摘要浮层 SHALL 切换为 pinned 状态
- **AND** 浮层 SHALL 展示全部 user prompt 摘要
- **AND** 内容区 SHALL 使用固定最大高度与独立纵向滚动，而不是扩大 Chat 布局

#### Scenario: 固定列表保持选中项可见

- **WHEN** pinned 列表中的 selected prompt 因方向键、滚轮或定位操作发生改变
- **THEN** Renderer SHALL 将 selected 摘要滚动到浮层内容区可见范围内
- **AND** 消息列表 SHALL NOT 因浮层自身滚动而滚动

#### Scenario: 点击完整列表摘要定位 prompt

- **WHEN** 用户点击 pinned 列表中的任一 prompt 摘要
- **THEN** Renderer SHALL 使用标准导航语义定位对应 prompt
- **AND** pinned 浮层 SHALL 保持打开并将该摘要设为 selected

#### Scenario: 浮层仅显示允许的导航元信息

- **WHEN** 摘要浮层可见
- **THEN** 浮层 MAY 显示 prompt ordinal、当前位置和 prompt 总数
- **AND** 浮层文本 SHALL NOT 包含“第 N 轮”、assistant 轮次或时间戳

#### Scenario: Pointer 从 rail 移入浮层

- **WHEN** transient 浮层已打开且 pointer 从 rail 移向浮层内容
- **THEN** Renderer SHALL 使用关闭延迟避免浮层在跨越间隙时意外关闭
- **AND** pointer 进入浮层后 SHALL 取消待执行的 transient 关闭

### Requirement: Active prompt 稳定跟随阅读参考线

Renderer SHALL 在消息滚动容器顶部以下 35% 的位置建立阅读参考线，并 SHALL 将 active item 定义为最后一个已经越过该参考线的 prompt。Renderer SHALL 在平滑导航期间锁定目标 active，直到目标到达参考线容差范围或导航结束，再恢复自动跟随。

#### Scenario: 滚动进入新的 prompt 区段

- **WHEN** 用户滚动使下一个 prompt anchor 越过阅读参考线
- **THEN** active item SHALL 更新为该 prompt
- **AND** 下一个尚未越过参考线的 prompt SHALL NOT 提前成为 active

#### Scenario: 点击横线平滑定位

- **WHEN** 用户点击一个 timeline 横线
- **THEN** 消息列表 SHALL 平滑滚动，使目标 prompt 位于阅读参考线
- **AND** 平滑滚动期间 active SHALL 保持为目标 prompt，不被中间 prompt 覆盖

#### Scenario: Reduced motion 立即定位

- **WHEN** 用户启用了 reduced-motion 并点击 timeline 目标
- **THEN** 消息列表 SHALL 立即定位目标 prompt
- **AND** SHALL NOT 执行平滑滚动动画

#### Scenario: 布局变化后重新同步

- **WHEN** streaming、Activity 展开折叠或消息内容变化导致 prompt anchor 位置改变
- **THEN** Renderer SHALL 重新测量 prompt anchor
- **AND** active item 与后续定位 SHALL 使用更新后的位置

### Requirement: Timeline 滚动同步避免逐项布局读取

Renderer SHALL 缓存有序 prompt anchor offsets，并 SHALL 通过 animation frame 合并 scroll 更新。普通 scroll frame SHALL 使用缓存查询 active item，而 SHALL NOT 为每个 prompt 查询 DOM 或读取布局位置。

#### Scenario: 长对话持续滚动

- **WHEN** 用户在包含大量 prompt items 的会话中持续滚动
- **THEN** Renderer SHALL 每个 animation frame 至多执行一次 active 同步
- **AND** active 同步 SHALL 从缓存 offsets 查询目标，不逐项调用 anchor 布局读取

#### Scenario: Timeline 卸载清理资源

- **WHEN** 用户切换会话或 timeline 宿主卸载
- **THEN** Renderer SHALL 清理 scroll listener、ResizeObserver、待执行 animation frame 和导航 fallback timer

### Requirement: Timeline 提供单一键盘导航入口

Renderer SHALL 让 timeline rail 作为一个具有 `slider` 语义的 Tab 停靠点，并 SHALL 提供可见焦点。导览刻度 SHALL NOT 各自进入 Tab 序列。Rail SHALL 以 1、items 总数以及当前 active 或 preview ordinal 提供 `aria-valuemin`、`aria-valuemax`、`aria-valuenow` 和可理解的 `aria-valuetext`。获得焦点后，ArrowUp/ArrowDown SHALL 逐条移动 preview，Home/End SHALL 移到首尾，Enter SHALL 定位当前 preview prompt 并固定完整列表，Escape SHALL 关闭摘要浮层。

#### Scenario: Rail 暴露完整 prompt 范围

- **WHEN** timeline rail 可见
- **THEN** rail SHALL 使用单一 `tabindex="0"` 和 `role="slider"`
- **AND** `aria-valuemax` SHALL 等于完整 prompt items 数量而不是可见导览刻度数量
- **AND** `aria-valuetext` SHALL 表达当前 prompt ordinal 与总数

#### Scenario: 方向键浏览 prompt 摘要

- **WHEN** timeline rail 获得焦点且用户按 ArrowUp 或 ArrowDown
- **THEN** preview SHALL 移动到前一个或后一个 prompt item
- **AND** transient 摘要浮层 SHALL 更新为对应附近摘要
- **AND** pinned 摘要浮层 SHALL 更新 selected 摘要并保持其可见

#### Scenario: Home 和 End 跳到完整数据边界

- **WHEN** 用户在 timeline rail 上按 Home 或 End
- **THEN** preview SHALL 分别移动到完整 timeline items 的首个或最后一个 prompt
- **AND** 行为 SHALL NOT 受可见导览刻度数量限制

#### Scenario: Enter 定位并固定当前 preview

- **WHEN** 用户按 Enter 且 timeline 存在当前 preview item
- **THEN** Renderer SHALL 使用标准平滑导航语义定位该 prompt
- **AND** 摘要浮层 SHALL 进入 pinned 完整列表状态

#### Scenario: Escape 关闭浮层

- **WHEN** 摘要浮层可见且用户按 Escape
- **THEN** Renderer SHALL 关闭 transient 或 pinned 浮层
- **AND** 当前 active prompt SHALL 保持不变

### Requirement: Timeline 以透明常态的悬浮层承载交互

Renderer SHALL 将 timeline 绝对定位并覆盖在 Chat 消息滚动区左侧，使 timeline 不参与消息列、消息内容最大宽度或 composer 的横向布局计算。Timeline surface SHALL 保持透明背景与透明边界并常驻轻量 backdrop blur；hover SHALL NOT 改变 surface 的背景或边界，仅在 focus-within 或 dragging 时 SHALL 使用轻量半透明语义背景和语义边界增强命中区辨识度。交互 surface SHALL NOT 通过 shadow、scale、translate 或其他几何变化表达 hover。

#### Scenario: Timeline 不占用消息区宽度

- **WHEN** timeline 因至少两个 prompt items 而显示
- **THEN** timeline host SHALL 以 absolute overlay 形式位于 Chat 消息区左侧
- **AND** 消息滚动容器、消息内容最大宽度与 composer SHALL 保持未显示 timeline 时的横向布局宽度
- **AND** Renderer SHALL NOT 创建固定 timeline column 或侧栏占位

#### Scenario: Timeline 常态保持透明并使用 backdrop blur

- **WHEN** timeline 未被 focus 或拖动
- **THEN** timeline surface SHALL 使用透明背景和透明边界
- **AND** timeline surface SHALL 使用常驻的轻量 backdrop blur
- **AND** 可见导览刻度与 active thumb SHALL 保持可识别

#### Scenario: Hover 不改变 surface 外观

- **WHEN** timeline 被 hover 且未被 focus 或拖动
- **THEN** timeline surface SHALL 保持透明背景、透明边界和既有 backdrop blur
- **AND** surface SHALL NOT 新增或改变 shadow、scale、translate 或 rotate

#### Scenario: 键盘聚焦或拖动时显示轻量底板

- **WHEN** timeline 被 focus-within 或处于 dragging 状态
- **THEN** timeline surface SHALL 使用项目语义 token 显示轻量半透明背景与边界
- **AND** surface 的尺寸和位置 SHALL 保持不变
- **AND** surface SHALL NOT 新增或改变 shadow、scale、translate 或 rotate

#### Scenario: Popover 使用独立实体表面

- **WHEN** transient 或 pinned 摘要浮层打开
- **THEN** popover SHALL 使用 Nuxt UI 的实体 surface 与浮层层级样式保证摘要可读
- **AND** popover surface SHALL 独立于 timeline 的透明常态背景
