## 1. Provider Manifest 与共享类型

- [x] 1.1 在 `frontend/src/integrations/providers.ts`（或合适位置）新建 provider manifest 模块，导出支持的 provider 列表（按平台合并；云效为本次唯一真实可连接 provider，其余未实现 provider 以 `comingSoon` 占位）
- [x] 1.2 为 manifest 定义 TypeScript 类型：`ProviderId`、`ProviderAuthType`、`ProviderCredentialField`、`ProviderCapability`、`ProviderManifest`
- [x] 1.3 在 preload 与共享类型目录同步 `Provider`、`ProviderConnectionState`、`ProviderResource`、`ProjectIntegrationEntry`、`ProjectIntegrationConfig` 类型
- [x] 1.4 在 manifest 中为每个 provider 声明 `capabilities`（stage + resourceType）与 `authType`、`credentialFields`（包含 helpText 与 helpLink）

## 2. 主进程：Provider 凭证存储与 IPC

- [x] 2.1 新建 `electron/main/infra/storage/provider-credential-store.ts`，实现按 providerId 读写 `{userData}/integrations/credentials/{providerId}.json`
- [x] 2.2 新建 `connectionStore.ts`，以 providerId 为 key 维护 `{userData}/integrations/connections.json`
- [x] 2.3 实现 `probeProvider(providerId)`：对已连接 provider 发一次轻量 API 调用验证凭证，失败为 401/403 时更新状态为 `expired`
- [x] 2.4 暴露 IPC 通道：`integrations:providers:list`、`:connect`、`:disconnect`、`:probe`，使用现有请求-响应协议（本次真实处理 `providerId = yunxiao`）
- [x] 2.5 为所有通道编写基于 `spec-test-utils` 的集成测试（Vitest）

## 3. 主进程：资源列表拉取与缓存

- [x] 3.1 新建 `electron/main/services/integration/provider-resource-service.ts`，按 `(providerId, resourceType)` 映射到资源拉取实现
- [x] 3.2 实现 5 分钟会话级 LRU 缓存（以 `providerId + resourceType + 查询参数` 为 key）
- [x] 3.3 为云效 provider 实现 `listResources` 适配器（按阶段能力覆盖：Projex 项目、Codeup 仓库、Flow 流水线）
- [x] 3.4 暴露 `integrations:providers:listResources` IPC 通道，参数包含 `providerId`、`resourceType`、`query`
- [x] 3.5 在资源拉取返回 401/403 时回写 `connectionStore`，将 provider 标记为 `expired`
- [x] 3.6 为资源适配器编写单元测试（Vitest），覆盖成功、失败、过期三类路径
- [x] 3.7 为 listResources IPC 通道编写集成测试，包含缓存命中/未命中场景

## 4. 主进程：项目级集成配置

- [x] 4.1 新建 `electron/main/infra/storage/project-integration-store.ts`，按项目 id 持久化 `ProjectIntegrationConfig`
- [x] 4.2 暴露 IPC 通道：`integrations:project:get`、`:set`，校验写入的 `{providerId, resourceType, resourceId}` 三元组与 manifest 声明一致
- [x] 4.3 为 projectIntegrationStore 与 IPC 编写集成测试（含跨项目数据互不影响的用例）

## 5. 前端：Settings 集成提供方视图（基于现有 settings tab）

- [x] 5.1 在现有 `frontend/src/pages/settings.vue` 中新增"集成提供方"tab 视图，沿用当前 settings 的 tab 切换模式
- [x] 5.2 实现 provider 卡片组件（Logo、名称、能力标签、状态徽章、展开内容）
- [x] 5.3 实现 API Token 表单子组件：字段来自 manifest，含 helpText 与 helpLink，"测试连接"与"连接"按钮
- [x] 5.4 对非云效且 `comingSoon` 的 provider 在 settings 页显示占位态，不实现真实 OAuth 入口与回调
- [x] 5.5 实现凭证脱敏回显逻辑（取 `connectionStore` 返回的脱敏字符串）
- [x] 5.6 实现"断开连接"按钮：调用 `:disconnect` IPC，成功后刷新状态
- [x] 5.7 页面挂载时对所有已连接 provider 并发调用 `:probe`，过期的 provider 卡片显示黄色徽章与"重新连接"按钮
- [x] 5.8 视图支持通过 URL query（如 `?tab=integration-providers&focus=yunxiao`）定位到指定 provider 卡片
- [x] 5.9 为页面与组件编写 Vitest 单元测试（含表单校验、状态徽章、跳转定位）

## 6. 前端：/integration 页面重构

- [x] 6.1 移除现有工具卡片的凭证表单、OAuth 入口、项目启用开关、项目级覆盖参数等 UI 元素
- [x] 6.2 新建"阶段区块"组件，按 manifest 与当前项目配置渲染该阶段已挂载的 provider 卡片
- [x] 6.3 新建 provider 卡片新版：显示 Logo、名称、阶段能力描述、状态徽章（只读），点击徽章跳转到 settings 集成提供方页面
- [x] 6.4 卡片展开后显示资源挂载区块：已挂载资源标签列表 + "添加资源"按钮
- [x] 6.5 新建"添加资源"面板：调用 `:listResources` IPC 获取资源列表，支持搜索、多选、刷新；完成后写回 `projectIntegrationStore`（本次真实资源列表仅覆盖云效）
- [x] 6.6 每个阶段区块底部实现"添加新平台"按钮与面板：展示该阶段 manifest 中所有 provider；未连接云效条目附"去设置连接"跳转链接；`comingSoon` 条目置灰不可选
- [x] 6.7 搜索框实现按 provider 名过滤；移除"按连接状态筛选"下拉
- [x] 6.8 已挂载资源标签支持移除；移除最后一个资源时该 provider 卡片从区块中移除
- [x] 6.9 过期或未连接 provider 卡片在展开后以"跳转引导"替换资源区块
- [x] 6.10 为核心组件编写 Vitest 单元测试（含挂载/移除资源、未连接跳转、搜索过滤）

## 7. 导航与 Settings Tab 集成

- [x] 7.1 在 settings 导航中新增"集成提供方"tab 入口
- [x] 7.2 在 /integration 卡片状态徽章的点击事件中实现到 settings 集成提供方 tab 视图的带 `focus` query 跳转
- [x] 7.3 校验 settings 页内 tab 切换与 /integration 之间来回导航的滚动/焦点恢复体验

## 8. 文档、规范与清理

- [x] 8.2 更新 `docs/RendererProcess.md`、`docs/MainProcess.md`、`docs/DataModel.md`、`docs/IPC.md` 中涉及 integration 的章节

## 9. 验证与发布前检查

- [x] 9.1 运行 `pnpm typecheck` 与 `pnpm lint` 通过
- [ ] 9.2 运行 `pnpm test` 全部通过，必要时使用 `pnpm test:coverage` 确认关键模块覆盖率
- [x] 9.3 `pnpm dev` 手动回归：云效 provider 连接 / 断开 / 过期回显、/integration 阶段内添加-移除资源、跨项目凭证共享
