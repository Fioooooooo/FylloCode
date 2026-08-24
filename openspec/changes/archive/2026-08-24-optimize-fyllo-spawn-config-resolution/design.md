## Context

`prompt_to_agent` 当前把 `config` 直接传给 `AcpSession.configOverrides`，`applySessionConfigOverrides()` 再按 `Object.entries()` 顺序用精确 option ID 校验和设置。该链路已经在 `newSession` / resume / load 获得 live `configOptions` 后、`connection.prompt()` 前执行，并在每次 `setSessionConfigOption()` 后采用 Agent 返回的完整 snapshot；缺口是父 Agent 在首次调用前不知道 option ID、category 对应的模型 value，也无法区分 provider 下的同名模型。

ACP `category=model` 与 `category=thought_level` 可以稳定定位语义配置槽，却不能让 `luna` 在 `openai/gpt-5.6-luna` 与 `openrouter/gpt-5.6-luna-0731` 之间自动唯一化。设计因此只消除无条件探测：精确或唯一匹配在一次 `prompt_to_agent` 内完成，真实歧义返回 live candidates，由父 Agent利用上下文选择或询问用户。

当前 `SpawnedSessionManager.executeTurn()` 在 ACP activation/config 之前就写入 user message、starting turn 和 running meta。为保证歧义不会制造虚假 turn，语义配置出现时需要先建立/恢复 ACP Session并完成配置准备；只有准备成功后才持久化正式 turn并 dispatch prompt。

## Goals / Non-Goals

**Goals:**

- 让父 Agent在首次正式调用中通过 `model`、`thought_level` 表达 ACP 标准 category 对应的配置意图。
- 用真实 Session 的 live config schema 解析 option ID和值，支持不同 Agent key、provider-qualified model ID和模型切换后的动态 options。
- 对无法唯一解析的请求返回结构化候选且不发送 prompt，并允许复用同一 prepared ACP Session。
- 明确定义语义字段与 legacy raw `config` 的去重、冲突、应用顺序和有限收敛规则。
- 保持仅使用 raw `config` 的现有调用、warning-and-continue、owner scope、并发、response和notification行为。

**Non-Goals:**

- 不把 session config options 加入 `available_agents`、initialize capability cache或静态 MCP tool enum。
- 不维护 Agent-specific 模型/provider映射，不根据当前默认 provider、Agent identity或选项顺序静默选择。
- 不为普通 Chat、draft probe或 renderer Config menu改变配置行为。
- 不持久化未 dispatch 的原始 prompt，也不新增跨应用重启恢复 prepared ACP Session 的承诺。

## Decisions

### 1. Agent-facing 输入保持“语义字段 + 精确 raw config”双入口

在 `src/shared/types/fyllo-spawn-rpc.ts#promptToAgentParamsSchema` 增加可选 string 字段 `model` 与 `thought_level`。它们是 live option value/name 的请求，不是 option ID：前者只解析唯一 `type=select && category=model` option，后者只解析唯一 `type=select && category=thought_level` option。

现有 `config: Record<string, string | boolean>` 保持 exact-ID 高级入口。未提供两个语义字段时，继续调用现有 `applySessionConfigOverrides()`，保持 raw-only 的输入顺序、校验、warning和prompt语义。

`src/mcp-servers/fyllo-spawn/src/tools/prompt-to-agent.ts` 的总描述说明首次调用可直接携带语义字段、无需 probe；schema字段 description 分别声明：

- `model` 不是 option ID，先于 thought level应用，零/多匹配不 dispatch；
- `thought_level` 在 model及其完整新 snapshot 后解析；
- `config` key必须是精确 live option ID，适用于 mode、model_config、boolean、custom/Agent-specific option，重复目标不得给出冲突值。

备选方案是把 last-known options 加入 `available_agents` 或动态 tool schema；它们会启动无关 Session、产生 stale列表并无法覆盖 Session-specific动态变化，因此拒绝。

### 2. 模糊匹配只做保守候选过滤，不做隐式排序

在新的纯 domain 模块 `src/main/domain/session/spawn/spawn-config-resolution.ts` 实现无副作用 resolver/planner。select value匹配按以下优先级返回候选集合，一旦某层非空就不进入下一层：

1. raw `value` 全等；
2. Unicode NFKC、trim、lowercase并折叠连续空白后的 `value` 全等；
3. 同样归一化后的 `name` 全等；
4. 将 query、value和name按 `/`、`:`、空白、`_`、`-` 分词，候选包含全部 query tokens。

每层只有一个候选才可设置；零候选为 `unsupported`，两个及以上为 `ambiguous`。不得使用编辑距离、相似度 score、默认 provider、currentValue或列表首项决胜。grouped options按 Agent原始顺序展平成候选，同时在返回结构中保留 group/name/value，便于父 Agent展示或选择。

如果 category 对应零个或多个 config options，同样返回 `configuration_required`，而不是猜测 option ID。

### 3. 组合请求采用 desired-state planner，而不是 last-write-wins

出现 `model` 或 `thought_level` 时，Main把语义请求与 raw `config` 转成 desired constraints，并在每次完整 live snapshot 后重新规划。当前 snapshot可识别的 raw constraints按 category形成确定性阶段：`mode` → `model` → `model_config` → `thought_level` → 其他/未分类；同阶段 raw entries保持 caller record的相对顺序。

语义 model占据 `category=model` 目标，语义 thought level占据 `category=thought_level` 目标。raw constraint与语义 constraint最终解析到同一 option ID时：目标值相同则去重；raw精确值属于语义查询的唯一候选时可作为精确消歧；目标值冲突则返回 `SPAWN_INVALID_REQUEST`。系统不得通过“最后写入者”静默覆盖。

每次成功 `setSessionConfigOption()` 后，以 response的完整 `configOptions` 替换 live snapshot并从最高阶段重新检查未满足 constraints。复用 `sessionConfigFingerprint()` 的 snapshot重复检测，并采用与 constraint数量成比例的有限迭代上限；重复或超限时返回配置不收敛错误且不发送 prompt。

raw-only 路径保留现有 set失败收集 warning后继续 prompt。只要请求含语义字段，语义 option无法定位、value无法唯一化、语义 set RPC失败、set response缺少完整 snapshot、冲突或无法收敛都属于 strict preparation failure，不得在默认/未确认配置下发送 prompt。前三类可由选择修复的定位/匹配问题返回`configuration_required`；set失败、snapshot不完整或不收敛返回新增RPC error code `SPAWN_CONFIG_FAILED`，避免把Agent/transport失败伪装成需要用户选择。

### 4. 配置准备在正式 turn持久化之前完成

将 `SpawnedSessionManager` 内部的 `SpawnedAcpSessionStore` 提取到 `src/main/services/session/spawn/spawn-acp-session-store.ts`，供正式turn和preparation共享；新增 `src/main/services/session/spawn/spawn-config-preparation.ts`，复用 `activateAcpSession()`、`recoverSessionConfig()`、`createSpawnRuntimeProfile()`、`markAcpSessionActive()`既有边界以及新的 domain resolver/planner。该服务接收现有 process entry、shared recovery store、workspace snapshot和三类配置输入，返回：

- `ready`: `acpSessionId`、最终完整 config snapshot和warnings；或
- `configuration_required`: `acpSessionId`、当前完整 snapshot和结构化 issues。

`SpawnedSessionManager.executeTurn()` 在语义字段存在时先调用 preparation。新 Session meta先以现有 `idle` 状态写入稳定 owner、Agent、process generation、workspace snapshot和scope；preparation持久化 resolved ACP session ID与config snapshot。只有 `ready` 后才更新 prompt preview、写 user message与starting turn、把 meta切到 running，并以 `presetAcpSessionId` 启动现有 `AcpSession` / `driveAcpTurn()`，避免复制 event mapping和terminal finalization。

`configuration_required` 返回时不写 user message或turn record，不设置 initial/current prompt preview，不创建response/notification，不启动watchdog；本次短暂的active reservation在 tool结果结算后正常释放。meta保持 `idle`、turnCount为零或既有值、ACP session/config snapshot可供同进程世代内的 continuation复用。Agent process失效、应用重启或Session LRU卸载后继续沿用既有expired语义，不承诺恢复prepared handle。

备选方案是在 `AcpSession` / shared `SessionEvent` 新增配置终态；这会把仅属于 spawn输入协商的状态扩散到普通 Chat与stream driver，因此拒绝。

### 5. 歧义是可恢复结果，不是非结构化 MCP failure

在 `promptToAgentResultSchema` 增加 `status: configuration_required` variant，至少包含：

- `sessionId`；
- `promptDispatched: false`；
- 精简后的当前 config snapshot；
- `issues[]`，每项包含 parameter、reason (`unsupported | ambiguous | missing_category_option`)、requested、可选 optionId/category及按原顺序排列的 candidates（value、name、可选group/description）。

background与sync请求在 prompt尚未 dispatch时都直接返回该variant，不返回accepted/completed，也不建立notification。父 Agent可用同一 `sessionId`、原 prompt和精确 value再次调用；Main必须重新校验 live snapshot，不能信任旧候选。

输入自身矛盾、boolean/string类型错误或同目标冲突继续使用 `SPAWN_INVALID_REQUEST`；语义set失败、response缺少完整snapshot或无法收敛使用`SPAWN_CONFIG_FAILED`并保证prompt未dispatch。这把“需要选择”“调用无效”和“Agent配置操作失败”分开，避免父 Agent从错误字符串解析候选。

## Risks / Trade-offs

- [模糊token规则仍可能得到多个合理候选] → 多候选永不自动排序，返回完整结构化列表。
- [prepared Session占用Agent connection-local资源] → 结果返回后不占active turn容量；继续受process generation、LRU和应用退出清理约束，不承诺跨进程恢复。
- [配置依赖可能形成循环] → 每次使用完整snapshot重规划，并通过fingerprint与有限迭代终止且不dispatch。
- [preparation与正式turn之间进程失效] → dispatch前重新校验process generation和active ACP handle；失效时沿用`AGENT_PROCESS_INVALIDATED`/expired结果。
- [字段描述过长影响模型理解] → 总描述只解释工作流，字段description就地声明输入语义、匹配失败和冲突规则；测试断言关键短语而非整段字符串。

## Migration Plan

1. 先扩展shared input/result schema和纯resolver测试；旧请求不含新字段时继续解析。
2. 接入spawn-specific preparation与prepared result，保持stored meta version 1及现有idle状态，无需离线migration。
3. 调整Manager持久化顺序和MCP字段描述，补齐raw-only回归、background/sync、续聊、进程失效与inspection测试。
4. 回滚时可移除新字段/result variant和preparation分支；旧raw config数据及已有spawned storage无需转换。

## Open Questions

无。匹配唯一性、冲突处理、配置顺序、prepared生命周期和legacy兼容范围均已确定。
