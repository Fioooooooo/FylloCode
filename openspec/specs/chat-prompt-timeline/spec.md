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

Renderer SHALL 将 timeline items 渲染为固定纵向间距、统一左边缘的横线索引。默认横线 SHALL 使用 neutral 状态；当前 active 横线 SHALL 延长到 active 长度并使用 primary/teal；hover、pointer preview 或 keyboard preview 横线 SHALL 延长到相同 active 长度，但非 active preview SHALL 保持 neutral 颜色。

#### Scenario: 多个 prompt 形成紧凑横线索引

- **WHEN** timeline 展示多个 prompt items
- **THEN** 所有横线使用相同纵向间距和相同左侧起点
- **AND** timeline 的内容高度由紧凑固定步长决定，而不是把横线拉伸到占满聊天视口

#### Scenario: Active 横线表达当前阅读位置

- **WHEN** 某个 prompt item 是当前 active item
- **THEN** 该横线使用 active 长度与 primary/teal 状态
- **AND** 其他未预览横线保持较短 neutral 状态

#### Scenario: Hover 只改变横线长度

- **WHEN** 用户 hover 或键盘预览一个非 active prompt item
- **THEN** 该横线延长到与 active 横线相同的长度
- **AND** 该横线保持 neutral 颜色

#### Scenario: 超长索引保持可用

- **WHEN** 等距横线的总高度超过聊天内容区允许的 timeline 高度
- **THEN** timeline SHALL 在自身区域内滚动而不扩大或压缩消息阅读列
- **AND** active 或 preview 横线 SHALL 保持在 timeline 可见区域内

### Requirement: Timeline 指针区域连续命中最近 prompt

Renderer SHALL 让 timeline rail 的整个纵向指针区域映射到最近的 prompt item，而不是只让可见横线像素响应指针。横线之间 SHALL 不存在无法预览任何 item 的 hover dead zone。

#### Scenario: 指针位于两条横线之间

- **WHEN** 指针在 timeline rail 内移动到两条可见横线之间
- **THEN** Renderer SHALL 根据指针纵向位置预览最近的 prompt item
- **AND** 对应横线 SHALL 使用 preview 长度

#### Scenario: 指针拖动扫过 timeline

- **WHEN** 用户在 timeline rail 上按下并纵向拖动指针
- **THEN** Renderer SHALL 按指针经过的等距索引连续选择最近 prompt
- **AND** 消息列表 SHALL 使用 immediate 滚动定位到当前经过的 prompt
- **AND** pointerup 或 pointercancel 后 SHALL 释放拖动状态

### Requirement: Timeline 使用单一无轮次摘要浮层

Renderer SHALL 为 timeline 使用单一受控摘要浮层，并 SHALL 最多展示当前 preview prompt 及其相邻 prompt 的三条摘要。浮层 SHALL 使用 item 的 prompt preview 帮助内容识别，且 SHALL NOT 展示轮次、序号、时间或统计元信息。

#### Scenario: Hover prompt 显示附近摘要

- **WHEN** 用户 hover 一个 timeline item
- **THEN** Renderer SHALL 打开单一摘要浮层
- **AND** 浮层 SHALL 展示该 item 及其附近最多三条 prompt 摘要
- **AND** 当前 preview 摘要 SHALL 使用可见的选中状态

#### Scenario: 首尾 item 的摘要数量补齐

- **WHEN** 用户预览首个或最后一个 timeline item
- **THEN** 浮层 SHALL 从可用的另一侧补齐最多三条摘要
- **AND** 浮层 SHALL NOT 创建不存在的摘要

#### Scenario: 摘要不泄露轮次元信息

- **WHEN** 摘要浮层可见
- **THEN** 浮层文本 SHALL NOT 包含“第 N 轮”、item index、时间戳或总轮次数

#### Scenario: 点击浮层摘要定位 prompt

- **WHEN** 用户点击浮层中的任一 prompt 摘要
- **THEN** Renderer SHALL 定位对应 prompt
- **AND** SHALL 复用点击横线的相同导航语义

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

Renderer SHALL 让 timeline rail 作为一个 Tab 停靠点，并 SHALL 提供可见焦点。横线 items SHALL NOT 各自进入 Tab 序列。获得焦点后，ArrowUp/ArrowDown SHALL 移动 preview，Home/End SHALL 移到首尾，Enter SHALL 定位当前 preview prompt，Escape SHALL 关闭摘要浮层。

#### Scenario: 方向键浏览 prompt 摘要

- **WHEN** timeline rail 获得焦点且用户按 ArrowUp 或 ArrowDown
- **THEN** preview SHALL 移动到前一个或后一个 prompt item
- **AND** 摘要浮层 SHALL 更新为对应附近摘要

#### Scenario: Home 和 End 跳到索引边界

- **WHEN** 用户在 timeline rail 上按 Home 或 End
- **THEN** preview SHALL 分别移动到首个或最后一个 prompt item

#### Scenario: Enter 定位当前 preview

- **WHEN** 用户按 Enter 且 timeline 存在当前 preview item
- **THEN** Renderer SHALL 使用标准平滑导航语义定位该 prompt

#### Scenario: Escape 关闭浮层

- **WHEN** 摘要浮层可见且用户按 Escape
- **THEN** Renderer SHALL 关闭浮层
- **AND** 当前 active prompt SHALL 保持不变
