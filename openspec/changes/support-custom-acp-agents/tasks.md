# 支持自定义 ACP Agent — 实现任务

## 1. 共享类型与配置文件读写

- [x] 1.1 在 `src/shared/types/acp-agent.ts` 新增 `AcpCustomAgentConfig` 类型，字段为 `command: string`、`args?: string[]`、`env?: Record<string, string>`
- [x] 1.2 在 `src/shared/types/acp-agent.ts` 新增 `AcpCustomAgentsJson` 类型，结构为 `{ agent_servers: Record<string, AcpCustomAgentConfig> }`
- [x] 1.3 在 `src/shared/types/acp-agent.ts` 为 `AcpAgentStatus` 增加可选 `source?: 'registry' | 'custom'` 字段
- [x] 1.4 创建 `src/main/infra/storage/custom-agent-config-store.ts`，实现 `readCustomAgents(): Promise<AcpCustomAgentsJson>` 与 `writeCustomAgents(config: AcpCustomAgentsJson): Promise<void>`
- [x] 1.5 `readCustomAgents` 在文件缺失时返回 `{ agent_servers: {} }`，解析失败时抛出自定义错误

## 2. Agent Catalog Service

- [x] 2.1 创建 `src/main/infra/acp/agent-catalog-service.ts`，定义 `CatalogAgent` 类型：包含 `id`、`source: 'registry' | 'custom'`、`name`、`registryEntry?`、`customConfig?`
- [x] 2.2 实现 `listAgents(): Promise<CatalogAgent[]>`，合并 `acp:getRegistry` 返回的 Registry Agent 与 `custom-agents.json` 中的 Custom Agent
- [x] 2.3 实现 `getAgentById(id: string): Promise<CatalogAgent | undefined>`，支持 `custom-` 前缀 id 反查
- [x] 2.4 实现 `isCustomAgentId(id: string): boolean` 工具函数
- [x] 2.5 实现 command 路径规范化：支持 `~` 展开与 PATH 查找，生成绝对路径
- [x] 2.6 实现 custom agent id 生成函数：`custom-${slug(basename(command))}-${shortHash(command + args)}`
- [x] 2.7 为 agent-catalog-service 添加单元测试，覆盖 registry/custom 合并、id 生成、路径解析

## 3. 主进程状态检测改造

- [x] 3.1 修改 `src/main/infra/acp/detector.ts` 的 `detectAgentStatuses`，签名改为接收 `CatalogAgent[]` 而非 `AcpRegistry`
- [x] 3.2 在 `detectAgentStatuses` 中为 `source === 'custom'` 的 agent 执行 `which` / `where` 或文件存在性检测
- [x] 3.3 修改 `src/main/services/acp-agent/acp-agent-service.ts` 的 `listAgentStatuses` 与 `detectAgentStatusesForced`，先调用 `listAgents()` 再传入 detector
- [x] 3.4 修改 `src/main/services/acp-agent/acp-agent-service.ts` 的 `refreshStatusesInBackground`，使用 Catalog Agent 列表触发后台检测
- [x] 3.5 为 detector 的 custom agent 分支添加单元测试

## 4. 主进程 ensureAgent 改造

- [x] 4.1 修改 `src/main/services/acp-agent/acp-agent-service.ts` 的 `ensureAgent`，对 `custom-` 前缀 id 跳过 `readInstalledRecords` 检查
- [x] 4.2 `ensureAgent` 对 custom agent 通过 Agent Catalog 获取启动配置并调用进程池
- [x] 4.3 为 `ensureAgent` 的 custom agent 分支添加单元测试

## 5. 主进程 Process Pool 改造

- [x] 5.1 修改 `src/main/infra/process/acp-process-pool.ts` 的 `startProcess`，对 `custom-` 前缀 id 从 Agent Catalog 读取配置
- [x] 5.2 修改 `src/main/infra/process/acp-process-pool.ts` 的 `buildSpawnSpec`，新增 custom agent 分支：使用 `command` 作为 spawn 命令，`args` 作为参数，`env` 合并 `process.env`
- [x] 5.3 确保 custom agent 启动失败时复用现有 ACP 启动错误码
- [x] 5.4 为 process pool 的 custom agent 分支添加单元测试

## 6. Capabilities 缓存改造

- [x] 6.1 修改 `src/main/infra/storage/agent-capability-store.ts` 的 `upsertPromptCapabilities`，允许 `installedVersion` 为空字符串 `""`
- [x] 6.2 修改 `src/main/services/acp-agent/acp-agent-service.ts` 的 `ensureAgent` 缓存命中逻辑：custom agent 的 `installedVersion` 视为 `""`
- [x] 6.3 在 `custom-agent-config-store.ts` 保存配置后，调用 capability store 删除所有 `custom-` 前缀条目的缓存
- [x] 6.4 为 custom agent capabilities 缓存策略添加单元测试

## 7. IPC 与 Preload

- [x] 7.1 在 `src/shared/types/channels.ts` 的 `AcpAgentChannels` 中新增 `saveCustomAgents: "acp:saveCustomAgents"`
- [x] 7.2 在 `src/preload/api/acp-agents.ts` 暴露 `saveCustomAgents(config: AcpCustomAgentsJson): Promise<void>`
- [x] 7.3 在 `src/main/ipc/acp-agents.ts` 实现 `acp:saveCustomAgents` handler，校验输入、写入文件、刷新状态
- [x] 7.4 为 `acp:saveCustomAgents` handler 添加单元测试

## 8. 渲染进程 Store 改造

- [x] 8.1 修改 `src/renderer/src/stores/acp-agents.ts`，使 `installedAgentIds` 从合并后的 statuses 计算，包含 custom agents
- [x] 8.2 修改 `getAgentLabel(id)`，对 `custom-` 前缀 id 返回 `custom-agents.json` 中的显示名
- [x] 8.3 确保 `icons` 对 custom agent 使用 `lucide:bot` fallback
- [x] 8.4 在 store 中新增 `saveCustomAgents` action，保存后调用刷新
- [x] 8.5 修改 `session.ts` 中对 `installedAgentIds` 的 watch，使其对 custom agent id 也能正确同步 draft agent

## 9. SettingsAgents UI

- [x] 9.1 在 `src/renderer/src/components/settings/SettingsAgents.vue` 的 tab 栏新增"自定义" tab
- [x] 9.2 在"自定义" tab 中使用 `stream-monaco` 渲染 JSON 编辑器，绑定当前 `custom-agents.json` 内容
- [x] 9.3 在编辑器下方添加字段说明（command、args、env 含义与示例）
- [x] 9.4 添加"保存"按钮，点击时校验 JSON 格式并调用 store action
- [x] 9.5 保存成功后显示成功提示，失败后显示错误信息
- [x] 9.6 确保切换到"自定义" tab 时不会触发 Registry Agent 的刷新逻辑

## 10. Chat UI 改造

- [x] 10.1 修改 `src/renderer/src/components/chat/empty/ChatEmptyAgentPicker.vue`，使 `visibleInstalled` 从合并后的 `installedAgentIds` 取前 4 个
- [x] 10.2 修改 `src/renderer/src/components/chat/empty/AgentPickerModal.vue`，顶部增加 Registry/Custom tab 切换
- [x] 10.3 Registry tab 保持现有搜索框与已安装/未安装分组
- [x] 10.4 Custom tab 以卡片网格展示 custom agents，无搜索框
- [x] 10.5 Custom tab 为空时展示空状态与"去设置页添加"入口
- [x] 10.6 确保 `AgentPickerCard` 对 custom agent 不渲染 `__fyllo.kind` 徽章
- [x] 10.7 点击 custom agent 卡片调用 `sessionStore.setDraftAgent(agentId)`

## 11. Workflow UI 改造

- [x] 11.1 修改 `src/renderer/src/components/workflow/StageCard.vue` 的 `agentItems`，从合并后的 `installedAgentIds` 构建 dropdown items
- [x] 11.2 确保 `getAgentLabel` 能为 custom agent 返回正确显示名
- [ ] 11.3 验证 workflow 执行时 `custom-xxx` id 能被主进程正确解析并启动

## 12. 图标与回显

- [x] 12.1 修改 `src/renderer/src/components/chat/SessionItem.vue` 或相关图标解析逻辑，对 custom agent 使用 `lucide:bot` fallback
- [x] 12.2 确保 `AgentCard` / `AgentPickerCard` 对 custom agent 使用 `lucide:bot` fallback

## 13. 测试与验证

- [x] 13.1 运行 `pnpm typecheck` 确保新增类型无错误
- [x] 13.2 运行 `pnpm test` 确保新增与修改的单元测试通过
- [ ] 13.3 在设置页验证 custom-agents.json 的保存与刷新
- [ ] 13.4 在 Chat empty 状态验证 custom agent 出现在 4 个 slot 中
- [ ] 13.5 在 AgentPickerModal 验证 Registry/Custom tab 切换与选择
- [ ] 13.6 在 workflow 中验证 custom agent 可被选择并保存到 YAML
- [ ] 13.7 验证 custom agent 对话能正常建立 ACP 连接并获取 capabilities

## 14. 文档

- [x] 14.1 检查 `guidelines/RendererProcess.md` 与 `guidelines/MainProcess.md`，若涉及 Agent 发现/启动的架构约定，更新相关章节
- [x] 14.2 在 `guidelines/Domain.md` 中补充 Custom Agent 相关术语（可选）
