## Context

ACP Registry 现接入近 40 个 Agent，打开 Agent 面板检测安装状态约需 5 秒，开销随 Agent 数线性增长。

当前实现 `electron/main/domain/acp/detector.ts` 的 `detectAgentStatuses`（346 行）用 `Promise.all` 并发遍历所有 Agent，每个 Agent 独立调用 `detectAgentInstallation`：

- npx 类（`detectNpxInstallation`，209 行）：各自 `findCommandPath("npm")` + `npm list -g <bareName> --depth=0 --json`。
- uvx 类（`detectUvxInstallation`，251 行）：各自 `findCommandPath("uv")` + `uv tool list`。
- binary 类（`detectBinaryInstallation`，285 行）：`which <cmd>` + `<cmd> --version`。

瓶颈是 npx 路径：`npm list -g` 每次都完整扫描并解析全局 `node_modules`，几十个 npx Agent 把它并发重复几十遍。

现有可复用的范式：`electron/main/infra/storage/acp-registry-cache.ts` 已实现 registry 的 stale-while-revalidate（`getRegistry` 98-117 行）+ `broadcastRegistryUpdated`（`acp-agent-service.ts:27`）+ 前端 `onRegistryUpdated` 监听（`acp-agents.ts:71`）。本方案对 status 复用同一范式。

约束：`acp:detectStatus` 的 IPC 契约（入空、出 `AcpAgentStatus[]`）不变；`installed.json`（`AcpInstalledMap`）作为安装账本权威源不变。

## Goals / Non-Goals

**Goals:**

- 单次检测延迟从约 5 秒降到约 1 秒以内（npx/uvx 进程数与 Agent 数解耦）。
- App 打开时面板秒开（先返回缓存快照，后台刷新就地更新）。
- 保持 `acp:detectStatus` 的输出契约与 `installed.json` 职责不变。
- 设置页 Refresh 与安装/卸载后刷新仍拿到实时真值。

**Non-Goals:**

- 不改 registry 缓存逻辑、不改 `installed.json` 结构。
- 不优化 binary 类的逐 Agent 探测（其必须实际探测路径/版本，无法批量；仅保证与聚合查询并行）。
- 不引入时间 TTL。
- 不改 Agent 卡片 UI 布局（沿用 `agent-status-panel` 既有展示）。

## Decisions

### 决策 1：npx 批量化——一次全量查询 + 内存匹配

将 `npm list -g <bareName>` 改为对整个检测周期只执行一次 `npm list -g --depth=0 --json`（不带包名），解析出 `dependencies` 全量 map，再让每个 npx Agent 用 `stripPackageVersion(distribution.package)` 在内存中查表。uvx 同理：`uv tool list` 只跑一次，结果在内存匹配。`which npm` / `which uv` 在周期内各跑一次。

实现形态：`detectAgentStatuses` 先做一次「环境预扫描」（命令路径 + 全量包清单），得到一个 `DetectionContext`，再把它传给各 Agent 的检测函数。`detectNpxInstallation` / `detectUvxInstallation` 改为接收预扫描结果而非自行 spawn。

**为什么不分包查询**：`npm list -g <pkg>` 与 `npm list -g`（全量）耗时同量级（都要读整棵全局树），但后者只需一次。**备选**：用 `fs` 直接读全局 `node_modules/<pkg>/package.json` —— 否决，因为全局根路径解析依赖 npm 配置（prefix），不如 `npm list --json` 稳健。

### 决策 2：status 缓存镜像 `AcpRegistryCache`

新增 `shared/types/acp-agent.ts`：

```ts
export interface AcpStatusCache {
  fetchedAt: number;
  statuses: AcpAgentStatus[];
}
```

新增 `electron/main/infra/storage/acp-status-cache.ts`，镜像 `acp-registry-cache.ts` 的读写：`readStatusCache(): Promise<AcpStatusCache | null>`（解析失败返回 null）、`writeStatusCache(statuses)`，落盘 `getDataSubPath('acp')/status-cache.json`。**不实现** `isExpired`（无 TTL）。

**为什么复用此结构**：`statuses` 元素即 `AcpAgentStatus`，与前端契约同构，store 的 `mapStatuses()` 零适配直接消费。

### 决策 3：detect 与 refresh 的新鲜度语义分叉

`detectAgentStatuses(registry)` 拆出可复用的纯检测核心。在 `acp-agent-service.ts` 暴露两条路径：

- `listAgentStatuses()`（服务于 `acp:detectStatus`，SWR）：读缓存 → 有则立即返回，并 `void` 触发后台 `detectAgentStatuses` → 写缓存 → `broadcastStatusUpdated`；无缓存则前台 `await` 检测 + 写缓存后返回。后台刷新用一个 module 级 `inFlight` promise 去重（仿 `acp-registry-cache.ts:13` 的 `refreshPromise`），避免并发重复检测。
- `detectAgentStatusesForced()`（服务于手动 Refresh 与安装/卸载后刷新）：前台 `await` 检测 + 写缓存后返回，不读缓存。

**前端侧**（`frontend/src/stores/acp-agents.ts`）：`refreshStatus()` 当前被 bootstrap、`refreshAll`、install、uninstall 共用（152 行）。bootstrap 路径走 SWR（`detectStatus`）；`refreshAll`/install/uninstall 需要实时真值——为它们走强制检测。

实现选择：新增 `acp:detectStatusForced` channel 与 `detectStatusForced()` API，store 内 `refreshStatus(force = false)` 按参数选 channel；`refreshAll`、`installAgent`、`uninstallAgent` 调 `refreshStatus(true)`，bootstrap 的 `ensureInitialized` 调 `refreshStatus(false)`。

**备选**：复用单一 `acp:detectStatus` 加布尔入参 —— 否决，因现有 `detectStatus()` 入参为空，加参数会让「自动 vs 强制」语义混在一个 channel，分两个 channel 更清晰且便于单测。

### 决策 4：`acp:statusUpdated` 广播

`shared/types/channels.ts` 的 `AcpAgentChannels` 新增 `statusUpdated: "acp:statusUpdated"`。`acp-agent-service.ts` 新增 `broadcastStatusUpdated(statuses)`（仿 `broadcastRegistryUpdated`，27 行）。preload `electron/preload/api/acp-agents.ts` 新增 `onStatusUpdated(listener)`（仿 `onRegistryUpdated`，59 行）。`frontend/src/api/acp-agents.ts` 转发 `onStatusUpdated`。store `ensureAgentListeners`（69 行）挂 `onStatusUpdated` → `statuses.value = mapStatuses(payload)`。

## Risks / Trade-offs

- **外部安装变更短暂滞后** → App 打开瞬间显示上次快照，约 1 秒后经 `acp:statusUpdated` 自动跟上；设置页 Refresh 走强制检测立即更正。已写入 spec 作为既定行为。
- **`updateAvailable` 依赖 registry 版本，缓存快照可能滞后于后台 registry 刷新** → 同一后台刷新周期内 registry 与 status 各自更新，短暂不一致会在下一次检测对齐；不影响安装/卸载正确性。
- **binary 类仍随 Agent 数线性 spawn** → 当前 binary Agent 占比低且与聚合查询并行，影响有限；若未来 binary Agent 增多需再优化，本次不处理（Non-Goal）。
- **`npm list -g` 全量解析在超大全局环境仍偏慢** → 它成为新的耗时下限，但只跑一次，相比现状是数量级改善。
- **后台刷新与窗口生命周期** → 后台检测完成时窗口可能已关闭，`broadcastStatusUpdated` 遍历 `BrowserWindow.getAllWindows()` 天然安全（无窗口则不推送），缓存已落盘下次仍可用。

## Migration Plan

- 纯增量：新增文件与 channel，不破坏现有 IPC 契约。
- 首次运行无 `status-cache.json`，自动走前台检测路径生成缓存，无需迁移脚本。
- 回滚：移除 SWR 分支让 `listAgentStatuses` 回到直接 `detectAgentStatuses` 即可，缓存文件可忽略。

## Open Questions

无（新鲜度策略已定为「App 打开检测 + 手动刷新，无 TTL」）。
