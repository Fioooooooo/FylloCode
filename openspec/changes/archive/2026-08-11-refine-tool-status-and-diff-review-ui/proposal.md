## Why

当前每个工具标题都追加四态文字，完成态和 Nuxt UI 已提供的 shimmer 语义重复；文件 diff 又直接在工具详情中铺开完整前后内容，多文件或长文件时难以浏览。需要收紧工具状态视觉，并把同一 turn 的文件变更集中到适合代码审查的只读 Diff Slideover。

## What Changes

- 简化普通工具标题：`pending`、`in_progress` 与 `completed` 只显示工具名称，前两者继续由 Nuxt UI shimmer 表达非终态；`failed` 保留“失败”文字，并将具体工具 icon 使用 error 语义色。
- 为不再显示可见状态后缀的工具保留可访问状态名称；直接工具与 `ChatActivityGroup` 子工具使用同一规则，group header 保持现有摘要、代表图标和 streaming 行为。
- 将工具详情中内联的“修改前 / 修改后 / 新增内容”替换为精简的文件变更入口，不再在消息流内铺开完整文件文本。
- 从当前 assistant message（即当前 turn）的所有普通 tool parts 聚合结构化 ACP diff，按路径生成 turn 级文件变更列表；同一路径使用最早旧内容与最晚新内容形成净变化，恢复原状的路径不显示。
- 点击任意文件变更后打开一个与现有文件预览一致宽度的 window-level Slideover，以 Nuxt UI Accordion 展示该 turn 的文件列表；文件项默认全部折叠，用户可任意展开多个，首次展开时使用项目锁定的 `stream-monaco@0.0.46` `createDiffEditor()` 创建独立只读 diff，并关闭 Monaco 自带的 `diffOverview`。Accordion content 不设置固定高度或最大高度，Diff Editor 在 diff 与 unchanged ranges 计算完成后按两侧可见 content height 自适应，由 Slideover 外层统一滚动；收起时只隐藏 content、不销毁 editor。新建文件使用空 original，删除文件使用空 modified。
- 历史消息继续只使用该历史 turn 已持久化的 ACP diff snapshot；不重新读取磁盘，不把整个 Session 的 ACP diff 聚合成工作区总变更。
- 调整 UI guideline：进行中工具允许以带可访问状态名称的 shimmer 代替可见状态后缀；失败仍必须同时具有可见文字和 error icon 语义，不能只靠颜色表达。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `assistant-activity-display`: 修改普通工具的状态文字与失败视觉要求，并将工具内联 diff 展示改为当前 turn 聚合、Accordion 文件列表和 Monaco Diff Slideover 审查。

## Impact

- Renderer 工具投影与组件：`src/renderer/src/utils/chatTool.ts`、`src/renderer/src/components/chat/message/ChatToolItem.vue`、`ChatToolDetails.vue`、`ChatActivityGroup.vue` 及消息列表宿主。
- 新增 Renderer 文件变更审查 feature，复用 `stream-monaco`、Nuxt UI overlay 和现有本地文件预览中的主题/清理模式；不新增依赖，不复用本地文件读取与授权 controller。
- 测试：工具状态、turn diff 聚合、overlay 生命周期、Monaco diff 参数、主题、`diffOverview` 关闭、首次展开延迟创建、按可见 content 高度自适应、Accordion 默认全折叠与多项展开、折叠 content 保留、重复折叠重开以及实时/历史一致性。
- 规范与指南：`openspec/specs/assistant-activity-display/spec.md`、`guidelines/UiDesign.md`。
- 不影响 ACP mapper、共享 stream schema、Main/Renderer assembler、消息 JSONL 格式、location 本地文件预览或 Session/工作区 Git diff。
