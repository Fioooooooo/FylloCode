## Why

ACP Registry 已接入近 40 个 Agent，每次打开 Agent 面板检测已安装状态需要约 5 秒，且开销随 Agent 数量线性增长，未来接入更多 Agent 后会持续恶化。根因是 `detectAgentStatuses` 对每个 Agent 各自 spawn 多个子进程：尤其是每个 npx Agent 都独立执行一次 `npm list -g <pkg>`（各自完整扫描并解析全局 `node_modules`），几十个 Agent 把这件重活并发重复了几十遍，互相争抢 CPU 与磁盘 I/O，反而比串行更慢。

## What Changes

- **批量化检测**：将逐 Agent 重复的命令探测改为「按检测方式分组、每组只跑一次」。`npm list -g --depth=0 --json`（不带包名）只执行一次拿到全量全局包，在内存中匹配各 npx Agent；`uv tool list`、`which npm`、`which uv` 在单次检测周期内各只执行一次并复用结果。检测的对外输出 `AcpAgentStatus[]` 结构不变。
- **新增状态检测缓存（持久化快照）**：检测结果落盘到 `acp/status-cache.json`（结构 `{ fetchedAt: number, statuses: AcpAgentStatus[] }`，镜像现有 `AcpRegistryCache`）。`acp:detectStatus` 改为「stale-while-revalidate」：有缓存时先立即返回缓存让面板秒开，同时在后台跑（批量化后的）检测，结果写回缓存并通过新广播通道推送给前端就地刷新；无缓存时（首次运行）前台同步检测后返回。
- **新增广播通道 `acp:statusUpdated`**：后台检测完成后主进程向所有窗口推送最新 `AcpAgentStatus[]`，前端 store 监听后覆盖 `statuses`（仿现有 `acp:registryUpdated` 机制）。
- **不设 TTL**：状态缓存不做时间过期判断。`acp:detectStatus` 永远「先返回缓存 + 后台必刷」；外部（如终端 `npm i -g`）造成的安装状态变更，会在下次打开 App 后约 1 秒自动跟上，或由用户在设置页手动刷新立即反映。
- **手动刷新强制实时检测**：设置页 Refresh（`refreshAll`）以及安装/卸载操作后的状态刷新，SHALL 绕过缓存、前台等待真实检测结果，以保证「新装/卸载 Agent 后立即反映正确状态」的既有契约。
- `installed.json`（`AcpInstalledMap`）保持不变，继续作为安装账本（权威源），是检测的输入并被检测回填修正；`status-cache.json` 仅为检测输出的只读派生快照，二者职责不重叠。

## Capabilities

### New Capabilities

- `agent-status-cache`: ACP Agent 安装状态的批量化检测策略与本地持久化缓存（stale-while-revalidate 新鲜度模型、`status-cache.json` 落盘结构、`acp:statusUpdated` 广播契约、自动检测与强制刷新的新鲜度语义分叉）。

### Modified Capabilities

- `agent-status-panel`: 「手动刷新检测」requirement 明确为强制实时检测（绕过缓存）；新增「App 打开时自动检测优先复用缓存、后台刷新就地更新」的行为契约。

## Impact

- **主进程检测层**：`electron/main/domain/acp/detector.ts`（`detectAgentStatuses` 批量化重构，新增内存匹配与命令结果复用）。
- **主进程服务层**：`electron/main/services/acp-agent/acp-agent-service.ts`（`listAgentStatuses` 改为 SWR；新增强制检测入口；新增 `broadcastStatusUpdated`）。
- **主进程存储层**：新增 `electron/main/infra/storage/acp-status-cache.ts`（镜像 `acp-registry-cache.ts`）。
- **共享类型**：`shared/types/acp-agent.ts` 新增 `AcpStatusCache`；`shared/types/channels.ts` 新增 `AcpAgentChannels.statusUpdated`。
- **IPC / preload**：`electron/main/ipc/acp-agents.ts`、preload 暴露 `onStatusUpdated`。
- **渲染进程**：`frontend/src/api/acp-agents.ts` 新增 `onStatusUpdated`；`frontend/src/stores/acp-agents.ts`（`refreshStatus` 区分 SWR/强制模式，`ensureAgentListeners` 挂载监听）。
- **测试**：detector、acp-agent-service、acp-status-cache、store 相关单测。
- **数据落盘**：用户数据目录新增 `acp/status-cache.json`。
