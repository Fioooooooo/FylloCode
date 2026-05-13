## Context

当前 /integration 页面把六个开发阶段下的工具卡片直接作为凭证连接入口：每张工具卡片同时承担"是不是连了这个工具""怎么连""在本项目中要不要启用""项目级覆盖参数"四个职责。这种 tool-centric 模型在以下两个事实下出现矛盾：

1. **平台型 provider 占企业研发场景主体**：云效的 Projex / Codeup / Flow 共用一个 token。一个用户的真实诉求是"我和云效有连接"，而不是"我和云效 Projex 有连接、和云效 Codeup 也有连接"。
2. **/integration 是项目级低频配置台**：用户希望它呈现"这个项目用哪些资源"，而不是"再走一遍连接流程"。配完即走，不应频繁回访。

这次改动把这两个语义层拆成两个独立的视图（settings 内的 integration-providers tab 与 /integration），并用 provider 作为凭证的中心实体。需要的现有约束：

- 主进程已有按 key 持久化 connections / credentials 的能力，迁移成本主要在 key 的语义变更（tool → provider）；
- preload 与渲染端类型走 contextBridge，类型变更需在两端同步；
- 项目维度的状态已经有 store（详见 `project-store-persistence` spec），可作为项目级集成配置的载体；
- 当前 settings 已采用单页 + tab 切换视图，新增“集成提供方”应沿用该模式，而不是顺手把整个 settings 重构为子路由；
- 不引入新依赖。

## Goals / Non-Goals

**Goals:**

- 将"凭证管理"和"项目级集成配置"的存储、UI、心智模型彻底拆开，使一次连接全局生效。
- 把 provider 作为第三方平台的中心实体，工具/能力作为 provider 下的子项；让"云效"这种一对多的平台在数据结构上自然表达。
- /integration 形态从"工具卡 + 内嵌连接表单"重构为"阶段分区下的 provider × 资源选择"，连接状态只读，未连接/过期统一引导回 settings。
- 每阶段允许多 provider、每 provider 下允许多资源，无人为单选限制。
- 现有 6 个阶段分区结构与"即将推出"标识保留，"自定义集成（Custom MCP）"入口位置和职责保持不变。

**Non-Goals:**

- 不重新定义阶段集合、不增删阶段。
- 不设计 /task 多源聚合、/schedule 多源调度、AI Chat 多源消歧的消费侧语义。
- 不设计同一 provider 多账号场景（v1 假定每个 provider 单账号；多账号留待后续 change 处理）。
- 不在本次引入新的真实 OAuth provider 或 OAuth 回调基础设施。
- 不调整 Custom MCP 入口及其数据结构。
- 不做凭证后台轮询健康检查（v1 仅在 settings 页打开/打开 /integration 时按需校验）。

## Decisions

### D1：Provider 是硬编码的注册表，新 provider 由代码发布而非用户自定义

引入"provider"概念后，需决定其可扩展性边界：

- **方案 A（采纳）**：provider 列表硬编码在前端配置文件（如 `frontend/src/integrations/providers.ts`），主进程通过对应模块识别 providerId；新增 provider 走代码发布。
- **方案 B**：让用户在 UI 里自定义 provider（输入 base URL、auth type 等）。

选 A 的理由：FylloCode 面向企业内部研发，每个 provider 背后通常有特定的 API 协议、资源拉取 endpoint、字段语义；这些都不可能由用户在 UI 上简单填写而正确工作。"自定义平台"的需求由现有 `integration-custom-mcp` 通过 MCP server 路径承接，与 provider 体系正交。

### D2：Provider 与"阶段能力"用静态映射表表达

每个 provider 需要声明自己"在哪些阶段下能贡献资源、贡献什么类型的资源"。这个映射决定了 /integration 页面在哪个阶段区块展示该 provider，以及该 provider 在该阶段需要拉取的资源类型。

```
ProviderManifest = {
  id: 'yunxiao',
  name: '云效',
  logo: ...,
  authType: 'apiToken' | 'oauth',
  credentialFields: [...],
  capabilities: [
    { stage: 'task-management', resourceType: 'projex-project' },
    { stage: 'source-control', resourceType: 'codeup-repo' },
    { stage: 'cicd', resourceType: 'flow-pipeline' },
  ],
}
```

这个 manifest 同时被前端（决定卡片展示位置、资源选择器形态）和主进程（决定调用哪个 API client 拉资源）消费，是 provider 概念的单一事实源。

### D3：凭证存储直接采用 provider key 的新结构，不保留旧数据

- 凭证文件路径调整：`{userData}/integrations/credentials/{providerId}.json`、`{userData}/integrations/connections.json`（按 providerId 索引）。
- 本次改动直接替换：应用升级后只认新路径；旧的按 tool key 组织的 credentials / connections 文件不再被读取，也不做自动迁移或备份。开发环境可手动清除 userData 下的旧 integrations 目录。
- 理由：产品未公开发布，不存在外部用户数据。保留兼容层只会拖慢落地。

### D4：项目级集成配置以 stage 为顶层 key、value 为资源数组

```
ProjectIntegrationConfig = {
  taskManagement: [
    { providerId: 'yunxiao', resourceType: 'projex-project', resourceId: 'projex-123' },
    { providerId: 'yunxiao', resourceType: 'codeup-repo', resourceId: 'repo-456' },
  ],
  sourceControl: [...],
  cicd: [...],
  ...
}
```

- 不要求"主资源"标记。多源歧义由消费方处理（参见 Non-Goals）。
- 持久化在每个项目自己的状态文件中（沿用现有项目 store 持久化机制），保证项目可独立打开/关闭、配置不互相串扰。
- /integration 页面的"启用/禁用"语义被资源选择天然取代——挂了至少一个资源即视为该阶段已启用，未挂资源即未启用。

### D5：资源列表按需拉取并设短缓存，不做后台预拉

- 用户进入 /integration 并展开某 provider 的资源选择器时，主进程懒加载该 provider 的资源列表，5 分钟会话内复用缓存。
- 用户点击"刷新"按钮可强制重拉。
- 不做应用启动时的批量预拉：避免无意义的 API 调用配额消耗，也避免影响启动速度。

### D6：凭证过期检测采取"机会触发"，不做后台轮询

- 触发时机：(1) 用户切换到 settings 中的“集成提供方”tab 时对所有已连接 provider 做一次轻量探测（拉取一个最便宜的 endpoint，例如 me/whoami）；(2) 用户在 /integration 展开某 provider 资源选择器、资源拉取返回 401/403 时即时识别为过期；(3) 主进程其他模块（如 MCP 工具调用）调用过程中遇到鉴权错误时上报状态。
- 过期 provider 在两个页面都打"凭证已过期"标签：settings 上提供"重新连接"操作；/integration 上不可选资源、提示跳转 settings。

### D7：/integration 上的资源选择器形态采用"已选标签 + 添加按钮"

- 每张 provider 卡片在阶段下展开后，显示已挂资源的标签列表（每个可移除）和"添加资源"按钮；
- 点击"添加资源"弹出资源选择面板（按 manifest 的 resourceType 决定形态：列表 / 多级选择 / 搜索框）；
- 未连接 provider 不出现在阶段卡片列表里（避免视觉噪音），但每个阶段提供"添加新平台"按钮，点击展示该阶段所有 manifest 中支持的 provider，未连接的在面板内附带"去 settings 连接"链接。

### D8：IPC 通道按"provider 域 + project-integration 域"分组

- `integrations:providers:list` / `:connect` / `:disconnect` / `:probe`
- `integrations:providers:listResources` （参数：providerId、resourceType、查询/分页）；本次仅需对 `providerId = yunxiao` 提供真实实现
- `integrations:project:get` / `:set` （参数：projectId、stage、resources[]）
- 沿用现有 IPC 请求-响应 + 流式协议（参考 `ipc-request-response`、`ipc-streaming` spec），无需扩展协议本身。

### D9：六个阶段分区结构保留为常量、Custom MCP 入口位置不变

- 六阶段顺序与命名沿用 `integration-tool-registry` 现状；
- 自定义集成入口仍位于 /integration 底部，不与 provider 体系耦合，独立持久化，独立 IPC 通道；
- 这降低视觉变更的破坏性，让本次 change 的认知冲击集中在"凭证位置变了"和"卡片内容变了"两点。

## Risks / Trade-offs

- **Risk**：manifest 中仍保留多个未实现 provider，可能让用户误判为已可用。
  → Mitigation：本次将未实现 provider 统一标记为 `comingSoon`，settings 与 /integration 中都只提供灰态展示或跳转引导，不提供真实连接入口。
- **Risk**：当前真实接入仅覆盖云效，multi-provider 能力在 UI 与数据结构上先行，短期内会出现结构上支持、能力上未铺开的阶段。
  → Mitigation：本次优先保证云效三阶段打通，其余 provider 保留 manifest 占位，后续逐个 provider 用独立 change 扩展。
- **Trade-off**：项目级取消"凭证覆盖"能力（原 `integration-project-enablement` 中的项目级覆盖参数被移除）。
  → 影响：极少数"同一 token 在不同项目下要不同 scope"的高级场景不再支持；可通过同 provider 多账号能力在后续 change 中补回。
- **Trade-off**：资源懒加载意味着首次展开有等待时间。
  → Mitigation：加载态用骨架屏；5 分钟会话缓存覆盖大多数二次操作。
- **Trade-off**：直接替换存储结构、不做迁移。
  → 影响：开发机上已有的 integration 本地状态（包括已连接的工具、已启用项目）在本次升级后完全失效，开发者需要在 settings 重新连接一次 provider、在 /integration 重新挂载资源。由于产品尚未公开发布，此代价在项目内部完全可接受。
- **Risk**：部署、通信、可观测等阶段在本次没有真实 provider 后端能力。
  → Mitigation：这些阶段保留区块结构，但 provider 条目统一以 `comingSoon` 呈现，不允许连接或挂载。

## Open Questions

- 多账号支持的优先级：是否在 v1.1 紧接着做？（影响 manifest schema 是否要预留 accountId 维度）
- 后续先扩 GitHub 还是阿里云观测/部署？建议按现有主进程能力与产品优先级拆分独立 change。
- /integration 上的搜索/筛选语义在新模型下是否仍然必要？倾向于保留搜索（可按 provider 名筛选），移除"按连接状态筛选"（已连接成为前提，无需再过滤）。
