## 1. 扩展共享契约与纯配置解析

- [x] 1.1 修改 `src/shared/types/fyllo-spawn-rpc.ts`：在 `promptToAgentParamsSchema` 增加带完整 `.describe()` 的可选 `model` / `thought_level`，为 `config` 增加 exact option-ID 描述；新增 `configuration_required` result、config resolution issue/candidate schemas以及 `SPAWN_CONFIG_FAILED` RPC error code。更新 `test/shared/types/fyllo-spawn-rpc.spec.ts`，验证旧raw-only输入仍可解析、默认background保持true、新字段严格拒绝空值、候选group/description可选字段和所有新result/error分支可往返解析。
- [x] 1.2 新建 `src/main/domain/session/spawn/spawn-config-resolution.ts` 与 `test/main/domain/session/spawn/spawn-config-resolution.spec.ts`：实现category option唯一定位、flat/grouped options原序展平、raw value精确→NFKC/case/space归一化value精确→归一化name精确→分隔符token包含的分层匹配；覆盖0/1/2+候选、同名provider模型、缺失/重复category、boolean排除、无编辑距离/首项/default-provider决胜。
- [x] 1.3 在同一domain模块实现语义constraints与raw exact-ID constraints的desired-state planner：阶段顺序为mode→model→model_config→thought_level→其他，同阶段raw entries保持输入相对顺序；同option同值去重、raw精确候选消歧、冲突值报告invalid request，并通过`sessionConfigFingerprint()`和有限迭代状态覆盖重置后重规划、snapshot重复与超限终止。

## 2. 在正式turn前准备spawned ACP配置

- [x] 2.1 将 `src/main/services/session/spawn/spawned-session-manager.ts` 内的 `SpawnedAcpSessionStore` 提取为 `src/main/services/session/spawn/spawn-acp-session-store.ts`；新建 `spawn-config-preparation.ts` 与 `test/main/services/session/spawn/spawn-config-preparation.spec.ts`，复用 `activateAcpSession()`、`recoverSessionConfig()`、`createSpawnRuntimeProfile()`和现有ACP process entry/shared recovery store，返回`ready | configuration_required`；每次set后只采用完整response snapshot，语义set/缺失snapshot/不收敛映射为`SPAWN_CONFIG_FAILED`且不dispatch，定位/匹配歧义返回结构化issues。
- [x] 2.2 修改 `src/main/services/session/spawn/spawned-session-manager.ts#executeTurn` / `runTurn`：raw-only请求继续走现有 `AcpSession.configOverrides`；含语义字段的请求先写入idle meta并调用preparation，持久化prepared ACP session ID、process generation和live config，只有`ready`后才写prompt preview、user message、starting turn并切换running，然后通过`presetAcpSessionId`复用现有`AcpSession`、`driveAcpTurn()`、assembler和terminal finalizer，禁止复制session event switch。
- [x] 2.3 在 `test/main/services/session/spawn/spawned-session-manager.spec.ts` 覆盖sync/background一次调用成功、model后动态thought option、warm prepared continuation、raw-only兼容、语义/raw同值去重与冲突、`configuration_required`不产生message/turn/notification/watchdog且释放reservation、`SPAWN_CONFIG_FAILED`不prompt，以及process generation失效后的expired结果。
- [x] 2.4 更新 `test/main/services/session/spawn/spawned-session-query-service.spec.ts` 和必要的 `src/main/services/session/spawn/spawned-session-query-service.ts` 投影：确认无turn的idle prepared Session可被owner-scoped list/detail安全读取，不被伪报running/completed，不暴露未dispatch prompt，并保持跨owner not_found与旧meta兼容。

## 3. 优化Agent-facing工具指导与server文档

- [x] 3.1 修改 `src/mcp-servers/fyllo-spawn/src/tools/prompt-to-agent.ts` 的总description，明确首次调用可直接带`model`/`thought_level`、无需probe、live schema解析和设置顺序、`configuration_required`候选选择/询问用户/同Session续用，以及`config`精确ID与冲突规则；更新 `test/mcp-servers/fyllo-spawn/tools.spec.ts`，断言关键指导语义和input schema字段description，不绑定整段文案。
- [x] 3.2 更新 `src/mcp-servers/fyllo-spawn/README.md` 与 `src/mcp-servers/fyllo-spawn/CHANGELOG.md`：记录新字段、精确/保守匹配规则、provider歧义示例、raw config边界、prepared continuation和`configuration_required` / `SPAWN_CONFIG_FAILED`恢复方式；不得声称initialize、available_agents或静态cache可提供live模型列表。

## 4. 集成回归与质量验证

- [x] 4.1 更新 `test/main/services/session/spawn/spawn-rpc-bridge.spec.ts` 与相关MCP RPC测试，覆盖新参数透传、`configuration_required`结构化结果、`SPAWN_CONFIG_FAILED`错误映射、取消/owner scope和background accepted既有结果不回归。
- [x] 4.2 先运行新增/修改的shared、domain、spawn service和MCP focused Vitest文件，再运行 `pnpm exec vitest run --project main`、`pnpm typecheck:node` 与 touched-file ESLint；修复所有失败，并确认未修改普通Chat/draft probe的config UI或持久化契约。
