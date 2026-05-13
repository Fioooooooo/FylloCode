## Why

当前 /integration 页面把"凭证管理"和"项目级集成配置"耦合在同一张工具卡片上，对于像云效这种"一个 token 跨多个开发阶段"的平台型 provider，会导致用户在任务管理区块为云效 Projex 配过 token 后，进入源代码区块仍然看到云效 Codeup 显示"未连接"，被迫在多个阶段重复配置或自行猜测连接状态如何继承。这在企业内部研发场景中尤其不友好，而云效正是当前仓库里唯一已有真实主进程集成能力的平台。

本次将凭证层从 /integration 中抽离到 settings，让 /integration 回归"项目级低频配置台"的纯粹定位：用户在 settings 一次性管好"我和哪些平台有连接"，在 /integration 只决定"这个项目在哪个阶段用哪些资源"。两层职责彻底分开，符合"在正确的地方做正确的事"。

## What Changes

- **新增** settings 中的 Integration Providers 视图：沿用当前 settings 页的 tab 切换模式，在 settings 内新增一个“集成提供方”tab，以 **provider 粒度**（平台维度，如"云效"而非"云效 Projex"）全局管理第三方平台凭证，覆盖连接、断开、凭证脱敏回显、过期标识等操作；同一 provider 的凭证在所有项目和所有阶段共享。本次仅要求云效 provider 具备真实连接与资源拉取能力，其余 provider 保留 manifest 与"即将推出"展示。
- 重构 /integration 为项目级低频配置台：保留现有六个阶段分区（项目管理 / 源代码控制 / CI/CD / 部署 / 通信 / 可观测性）作为企业开发工作流的组织轴，但将每个阶段的内容从"工具卡片 + 连接表单"改为"从已连接 provider 中选择本项目所需的资源"。
- /integration 上不再承载任何凭证写操作：连接状态来自 provider 层、对当前页面只读；当所需 provider 未连接或凭证过期时，提供"去设置中连接"跳转引导，由用户回到 settings 完成处理后再回到 /integration 继续配置资源。
- 项目级集成配置允许**每阶段挂多个 provider、每个 provider 下挂多个资源**。本次真实落地的资源挂载仅覆盖云效在任务管理、源代码控制、CI/CD 三个阶段的能力。
- 数据存储分层调整：provider 凭证与连接状态以 provider 为 key 全局持久化；项目级集成配置以 `project × stage × [{ providerId, resourceId }]` 形式按项目持久化，与 provider 凭证解耦。由于产品尚未公开发布，本次直接采用新存储结构，不保留对旧数据的兼容或迁移逻辑。
- **Out of scope（明确不在本次范围）**：
  - 不改动现有六阶段的增删，也不重新定义阶段边界；
  - 不设计 /task 多源聚合、/schedule 多源调度、AI Chat 多源消歧等消费侧语义（多源歧义由消费方在产品交互层自行处理，例如 AI 通过 AskUserQuestion 主动确认）；
  - 不在本次为新的 provider 引入真实 OAuth 流程；OAuth 类型 provider 如保留在 manifest 中，仅以"即将推出"或只读占位呈现；
  - 不修改 Custom MCP 入口（其作为 /integration 底部的高级扩展位继续保留，独立于 provider 凭证体系）；
  - 不做旧数据迁移与向后兼容（产品未公开发布，允许一次性替换）。

## Capabilities

### New Capabilities

- `integration-providers`: 在 settings 中以 provider 粒度全局管理第三方平台凭证、连接状态与凭证健康度（含过期标识与回显）；本次真实覆盖云效的 API Token 连接表单、凭证 CRUD、connections 与 credentials 文件的存储契约。

### Modified Capabilities

- `integration-tool-registry`: 改为按阶段组织"已连接 provider + 资源选择"，连接状态徽章变为只读，搜索/筛选语义和"即将推出"标识在新模型下的呈现方式相应调整。
- `integration-connection-management`: 移除 /integration 页面承担的凭证写入与断开操作，整体迁移至 `integration-providers`；本规范保留为 /integration 上的"连接状态只读读取与跳转引导"语义。
- `integration-project-enablement`: 把"启用开关 + 项目级凭证覆盖"重构为"项目级多 provider × 多资源选择"，移除项目维度对全局凭证的覆写能力（凭证不再有项目级覆盖路径）。
- `integration-config-panel`: 工具卡片展开后的配置面板内容由"账户连接区块"改为"该 provider 在本项目下的资源选择面板"，重新定义面板组成。

## Impact

- **前端代码**：
  - `frontend/` 中 /integration 页面的卡片组件、阶段分组组件、连接表单组件需要重写或拆解；
  - 在现有 settings 页内新增“集成提供方”tab 视图，复用现有连接表单 UI 元素；本次仅要求 API Token 形态的云效真实可用；
  - vue-router/auto 文件式路由需新增对应路径；
  - 项目级集成配置的 store / composable 需要新建或重构。
- **主进程代码**：
  - `electron/main/` 中 integration 模块的 connections / credentials 文件读写从"按工具 key"调整为"按 provider key"；
  - 新增按 provider 执行凭证健康检查（过期检测）的能力；
  - 新增项目级集成配置的持久化通道；
  - IPC 协议新增/调整：provider CRUD、provider 连接状态查询、项目集成配置 CRUD、provider 资源列表查询；本次真实资源查询仅覆盖云效的 Projex 项目、Codeup 仓库、Flow 流水线。
- **共享类型**：preload 与前端共享的类型定义需新增 `Provider`、`ProviderConnection`、`ProjectIntegration` 等概念；旧的 tool-centric 类型在本次变更中直接删除，不保留兼容别名。
- **持久化**：凭证与连接状态直接以 provider 为 key 写入新文件；项目级集成配置直接采用新结构。由于产品未公开发布，不实现旧数据迁移、不保留旧文件、不设回滚开关。
- **既有 spec**：`integration-tool-registry`、`integration-connection-management`、`integration-project-enablement`、`integration-config-panel` 均会被本次 change 修改；`integration-custom-mcp` 不受影响。
- **依赖与基础设施**：不引入新依赖，不调整 logging / error handling / 全局配置加载等横切机制，仅复用现有凭证存储与 IPC 框架。
