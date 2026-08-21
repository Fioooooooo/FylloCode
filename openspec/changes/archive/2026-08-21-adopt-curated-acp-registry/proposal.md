## Why

当前 ACP Agent 列表来自官方 Registry，其中包含长期不更新或 ACP 适配质量不足的 Agent，无法表达产品希望只提供热门、活跃或 ACP 兼容性较好的精选集合。同时，现有二进制安装依赖系统 `unzip`/`tar`，既不能可靠覆盖 Windows，也无法识别 Goose 使用的 `.tar.bz2`，且尚未执行 Registry 提供的 SHA-256 完整性校验。

## What Changes

- **BREAKING**：将唯一的远端 Agent 目录源切换为 `https://curated-acp-agents.onrender.com/registry.json`，不再查询官方 Registry，也不把官方源作为回退或合并来源。
- 为 Registry 缓存记录来源身份；来源不匹配或缺少来源身份的旧缓存不得作为精选目录返回，避免切源后继续展示官方列表。
- 扩展 binary distribution 契约以读取可选 `sha256`：存在摘要时必须在解压前完成 SHA-256 校验，摘要格式无效或校验不一致必须终止安装；缺少摘要时继续安装，并且不得把该安装表述为已验证。
- 将 binary 安装提交改为同父级 staging/backup 事务；摘要校验、解压、目录提交或 installed record 写入失败时保留旧安装和旧记录，首次安装失败不遗留半成品。
- 使用 `@xhmikosr/decompress` 统一处理精选源当前使用的 ZIP、TAR、TAR.GZ/TGZ 与 TAR.BZ2/TBZ2，移除对系统 `unzip`/`tar` 的安装前置条件；不受支持或损坏的归档必须失败，不得作为普通二进制静默复制。
- 在解压适配层中立即清除 `@xhmikosr/decompress` 返回条目的 `data` Buffer 引用并丢弃结果，降低成功解压后的内存驻留；明确该措施不消除库在解压期间完整缓冲压缩包和条目的峰值内存。
- 当前精选目录决定 Registry Agent 的发现与全局预热范围；仅存在于历史 `installed.json`、但已不在精选目录中的记录直接忽略，不为其增加兼容、迁移或回退逻辑。

## Capabilities

### New Capabilities

- `acp-agent-distribution`: 定义精选 ACP Agent 目录的唯一来源、缓存来源隔离、binary 摘要校验、跨平台归档解压、资源引用释放及目录成员资格边界。

### Modified Capabilities

- `acp-agent-connection-lifecycle`: 全局预热范围从“全部具有 installed record 的 Registry Agent”收窄为“当前精选目录中仍可发现且具有 installed record 的 Registry Agent”；精选目录之外的历史记录不再作为预热目标。

## Impact

- 主进程 Registry、安装与预热链路：`src/main/infra/storage/acp-registry-cache.ts`、`src/main/services/platform/acp-agent/installer.ts`、`src/main/infra/acp/agent-catalog.ts`、`src/main/services/platform/acp-agent/connection-warmup.ts`。
- 跨模块类型与持久化：`src/shared/types/acp-agent.ts` 与 `acp/registry-cache.json`；`acp/installed.json` 不增加 manifest 快照，也不新增历史记录迁移。
- 生产依赖：新增 `@xhmikosr/decompress` 11.1.4 或更高的安全修复版本；其运行时依赖必须随 Electron main 生产包分发。
- 测试：Registry 缓存来源隔离、SHA-256 成功/缺失/失败分支、失败时保留旧安装、各归档格式、资源引用释放、路径安全与精选目录范围内的全局预热。
