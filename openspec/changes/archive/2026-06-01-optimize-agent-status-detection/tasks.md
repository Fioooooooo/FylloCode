## 1. 共享类型与 Channel

- [x] 1.1 在 `shared/types/acp-agent.ts` 新增 `AcpStatusCache` 接口（`{ fetchedAt: number; statuses: AcpAgentStatus[] }`），紧邻现有 `AcpRegistryCache`（51 行）。验收：类型导出且 `pnpm typecheck` 通过。
- [x] 1.2 在 `shared/types/channels.ts` 的 `AcpAgentChannels`（90 行）新增 `statusUpdated: "acp:statusUpdated"` 与 `detectStatusForced: "acp:detectStatusForced"`。验收：常量可被主进程/preload/前端引用。

## 2. 状态缓存存储层

- [x] 2.1 新建 `electron/main/infra/storage/acp-status-cache.ts`，镜像 `acp-registry-cache.ts` 的读写结构：实现 `readStatusCache(): Promise<AcpStatusCache | null>`（读 `getDataSubPath('acp')/status-cache.json`，JSON 解析失败返回 `null`）、`writeStatusCache(statuses: AcpAgentStatus[]): Promise<void>`（`ensureAgentsDirectory` 后写 `{ fetchedAt: Date.now(), statuses }`）。**不实现** TTL/过期判断。验收：单测覆盖读取缺失、读取损坏、写入往返。
- [x] 2.2 为 2.1 新建 `electron/main/__tests__/infra/storage/acp-status-cache.test.ts`，参考 `acp-registry-cache.test.ts` 的 fs mock 范式，覆盖：无文件返回 null、损坏 JSON 返回 null、写入后可读回。

## 3. 检测层批量化（detector.ts）

- [x] 3.1 在 `electron/main/domain/acp/detector.ts` 新增检测上下文预扫描：实现内部函数（如 `buildDetectionContext`）一次性产出 `{ npmPath, uvPath, globalNpmPackages, uvToolList }`——`npmPath`/`uvPath` 各调用一次 `findCommandPath`；`globalNpmPackages` 调用一次 `runCommand(npmPath, ["list","-g","--depth=0","--json"])` 解析出 `dependencies` 全量 map；`uvToolList` 调用一次 `runCommand(uvPath, ["tool","list"])`。仅当 registry 含对应分发类型的 Agent 时才执行相应命令。
- [x] 3.2 重构 `detectNpxInstallation`（209 行）改为接收预扫描的 `globalNpmPackages`，用 `stripPackageVersion(distribution.package)` 在内存 map 中匹配判断 `installed`/`detectedVersion`/`installPath`，不再自行 spawn `npm`。
- [x] 3.3 重构 `detectUvxInstallation`（251 行）改为接收预扫描的 `uvToolList` 字符串，在内存中匹配，不再自行 spawn `uv`。
- [x] 3.4 调整 `detectAgentInstallation`（318 行）与 `detectAgentStatuses`（346 行）：先 `buildDetectionContext` 一次，再 `Promise.all` 遍历 Agent 时把 context 传入；binary 类（`detectBinaryInstallation`，285 行）保持逐 Agent 探测但与上述并行。保持返回 `AcpAgentStatus[]` 结构、`installed.json` 回填逻辑（357-397 行）不变。
- [x] 3.5 更新 `electron/main/__tests__/domain/acp/detector.spec.ts`：新增断言「多 npx Agent 时 `npm list -g` 只被调用一次且不含具体包名」「`which npm` 只调用一次」；保持原有安装/未安装/版本/回填用例通过。

## 4. 服务层 SWR 与广播

- [x] 4.1 在 `electron/main/services/acp-agent/acp-agent-service.ts` 新增 `broadcastStatusUpdated(statuses: AcpAgentStatus[])`，仿 `broadcastRegistryUpdated`（27 行）遍历 `BrowserWindow.getAllWindows()` 发送 `AcpAgentChannels.statusUpdated`。
- [x] 4.2 改写 `listAgentStatuses`（58 行）为 SWR：`readStatusCache()` 命中则立即返回其 `statuses`，并以 module 级 `inFlight` promise 去重的方式在后台执行 `detectAgentStatuses(registry)` → `writeStatusCache` → `broadcastStatusUpdated`；未命中则前台 `await detectAgentStatuses` → `writeStatusCache` 后返回。后台错误用 `logger.warn` 记录不抛出。
- [x] 4.3 新增 `detectAgentStatusesForced()` 服务函数：前台 `await` `loadAgentRegistry()` + `detectAgentStatuses` → `writeStatusCache` 后返回，不读缓存（供手动刷新/安装卸载后调用）。
- [x] 4.4 更新 `electron/main/__tests__/services/acp-agent/acp-agent-service.spec.ts`：覆盖「有缓存时 `listAgentStatuses` 立即返回缓存并触发一次后台检测+广播」「无缓存时前台检测并写缓存」「`detectAgentStatusesForced` 不读缓存」。

## 5. IPC 注册

- [x] 5.1 在 `electron/main/ipc/acp-agents.ts`（registerAcpAgentHandlers，21 行）新增 `ipcMain.handle(AcpAgentChannels.detectStatusForced, () => wrapHandler(() => detectAgentStatusesForced()))`，并从 service 导入该函数。验收：`acp:detectStatus` 仍走 SWR、`acp:detectStatusForced` 走强制检测。

## 6. Preload 与前端 API

- [x] 6.1 在 `electron/preload/api/acp-agents.ts` 的 `acpAgentsApi`（24 行）新增 `detectStatusForced(): Promise<IpcResponse<AcpAgentStatus[]>>`（invoke `detectStatusForced`）与 `onStatusUpdated(listener)`（仿 `onRegistryUpdated`，59 行，用 `subscribeToChannel(AcpAgentChannels.statusUpdated, listener)`）。
- [x] 6.2 在 `frontend/src/api/acp-agents.ts` 转发 `detectStatusForced()` 与 `onStatusUpdated(listener)`，签名与 preload 一致。

## 7. 渲染进程 Store

- [x] 7.1 在 `frontend/src/stores/acp-agents.ts` 的 `refreshStatus`（152 行）增加 `force = false` 参数：`force` 为 true 调 `acpAgentsApi.detectStatusForced()`，否则调 `detectStatus()`；结果均经 `mapStatuses` 写入 `statuses`。
- [x] 7.2 `ensureInitialized`（219 行，bootstrap 路径）保持调用 `refreshStatus()`（即 `force=false`，走 SWR 秒开）。
- [x] 7.3 `refreshAll`（251 行）、`installAgent`（278 行）、`uninstallAgent`（304 行）改为调用 `refreshStatus(true)`，保证拿实时真值。
- [x] 7.4 在 `ensureAgentListeners`（69 行）新增 `onStatusUpdated` 监听（仿 `onRegistryUpdated`，71 行），收到推送后 `statuses.value = mapStatuses(payload)`；在组件卸载/store 释放路径补充对应 stop 引用。
- [x] 7.5 更新 `frontend/src/__tests__/stores/acp-agents.spec.ts`：覆盖「`refreshAll`/install/uninstall 调用 `detectStatusForced`」「bootstrap 走 `detectStatus`」「收到 `onStatusUpdated` 推送后 `statuses` 被覆盖」。

## 8. 文档与验证

- [x] 8.1 评估并更新本地 guidelines：在 `guidelines/Domain.md`（已记录 registry-cache）补充 `status-cache.json` 的职责、与 `installed.json` 的「派生快照 vs 权威账本」区别、SWR + `acp:statusUpdated` 新鲜度模型；如涉及数据文件清单，同步更新 `guidelines/DataModel.md`。验收：新读者能据此理解两个文件的区别与刷新语义。
- [x] 8.2 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test` 全部通过；在本机实测打开 Agent 面板的检测耗时，记录优化前后数值（目标 < 1.5 秒）。验收：测试通过且耗时较优化前显著下降。
