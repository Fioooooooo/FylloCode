## Context

项目已经使用 @agentclientprotocol/sdk 1.3.0。ACP mapper 将公共 update.kind 作为字符串写入共享工具事件，Shared 层也刻意保持 toolKind: string，以避免共享代码依赖 Node 侧 SDK。Renderer 的 src/renderer/src/utils/chatTool.ts 目前维护一组较小的 canonical union、识别集合和图标映射；src/renderer/src/utils/chatAssistant.ts 再基于该 kind 生成 Activity 摘要。

当前 Kimi 采样已经证明 fetch 是实际出现的 raw kind，但本次变更不应为 Kimi 增加 Agent adapter。新增 kind 的识别必须依赖 ACP 公共字段，而不是标题、输入、输出或 Agent ID。

## Goals / Non-Goals

**Goals:**

- 让 Renderer 识别 ACP 1.3.0 的 delete、move、think、fetch、switch_mode。
- 保留旧消息和旧 Agent 使用的 write，并让未知字符串继续落到 other。
- 让直接工具、Activity group、流式状态和历史加载共用相同的 kind/icon/summary 映射。
- 保持 Main、Shared 与 Agent adapter 的现有边界。

**Non-Goals:**

- 不升级 ACP SDK；仓库当前已经是 1.3.0。
- 不改变 SessionEvent、持久化字段或 toolKind: string 的 Shared 类型。
- 不增加或修改任何 Agent ID、adapter alias、Kimi Agent/AgentSwarm 语义或子 Agent 树。
- 不根据自由文本猜测工具类型。

## Decisions

### 1. 在 Renderer 保留兼容扩展后的 canonical vocabulary

ToolKind 使用以下集合：read、write、edit、delete、move、search、execute、think、fetch、switch_mode、other。其中 write 是 FylloCode 历史兼容值，不是 ACP 1.3.0 的 canonical kind；other 是未知值和缺失值的安全回退。

getToolKind 只依据 toolMetadata.toolKind 的字符串值做精确集合判断。空值、未识别值和未来 SDK 新增但本版本尚未注册的值均返回 other。不得根据 title、toolName、input、output 或 Agent 身份重新分类。

### 2. 原始 kind 在 Main/Shared 保持不变

不改 mapSessionUpdate 的 Agent-neutral kind 复制逻辑，不向 Shared 引入 SDK 类型。新增类型的展示支持只在 Renderer canonical mapping 中实现；mapper 测试负责证明公共 kind 仍能无损到达共享事件。

### 3. 使用统一的图标和 Activity 文案映射

沿用 chatTool.ts 的单一图标映射入口，并按现有 IconConventions 使用 Lucide 图标。推荐映射如下；实现时以项目当前可用的 Lucide 名称为准：

| kind        | Activity 动词 | 名词     | 推荐图标                 |
| ----------- | ------------- | -------- | ------------------------ |
| read        | Read          | file     | i-lucide-file-text       |
| write       | Write         | file     | i-lucide-file-plus       |
| edit        | Edit          | file     | i-lucide-pencil          |
| delete      | Delete        | file     | i-lucide-trash-2         |
| move        | Move          | file     | i-lucide-move            |
| search      | Search        | page     | i-lucide-search          |
| execute     | Run           | command  | i-lucide-square-terminal |
| think       | Think         | time     | i-lucide-brain           |
| fetch       | Fetch         | resource | i-lucide-cloud-download  |
| switch_mode | Switch        | mode     | i-lucide-repeat-2        |
| other       | Run           | tool     | i-lucide-wrench          |

Tool kind think 与 reasoning part 共用 Think Activity 类别和 brain 语义；它们仍保持各自的 part 类型和详情渲染边界。fetch 不降级为 search，因为 ACP 已明确表达其为资源获取语义。

### 4. 保持未知值的渐进兼容

未知 kind 继续使用 other 图标和 Run <count> tools 摘要，原始字符串仍保留在工具 metadata 中，便于未来补充映射而不破坏历史数据。

## Risks / Trade-offs

- [新增 kind 的图标名称在当前图标集合中不存在] → 在实现和 Renderer 测试中验证 Lucide 名称；若单个推荐名称不可用，选择语义等价的现有 Lucide 图标，不改变 kind/文案契约。
- [旧历史消息出现新的图标或摘要类别] → 这是本次新增 canonical 语义的预期可见变化；write、other 和未知回退保持兼容。
- [未来 ACP 增加新的 kind] → 继续回退为 other，直到一次独立的 vocabulary 变更明确注册该类型。
- [tool kind think 与 reasoning 同类统计可能让计数合并] → 这是有意选择，保持用户看到统一的 Think 活动；part 类型和原始顺序不改变。

## Migration Plan

无需数据迁移。旧工具 metadata 中的 write 和未知字符串继续可加载；新代码只在读取和展示时识别新增 kind。回滚时删除 Renderer 新映射即可，不涉及持久化格式或 Agent 配置。

## Open Questions

无。本 Proposal 明确排除 Agent ID 和子 Agent 适配问题。
