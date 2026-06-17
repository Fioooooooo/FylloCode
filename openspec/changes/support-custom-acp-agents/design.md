# 自定义 ACP Agent 技术设计

## Context

FylloCode 当前的 Agent 架构是 Registry-centric 的：

- `data/acp/registry-cache.json` 缓存 ACP Registry；
- `data/acp/installed.json` 记录 Registry Agent 的安装状态；
- 状态检测、进程启动、能力获取全部假设 Agent 一定能在 Registry 中找到对应 entry。

本次变更需要让 FylloCode 支持用户通过本地 JSON 配置自定义 Agent，且这些 Agent 可能不在 ACP Registry 中。因此必须在主进程引入一个抽象层，把 Registry Agent 与 Custom Agent 统一成一份 Catalog，再让上层按 Catalog 工作。

## Goals / Non-Goals

**Goals:**

- 用户可通过 `data/acp/custom-agents.json` 配置自定义 Agent；
- 自定义 Agent 与 Registry Agent 在发现、选择、启动、对话链路中并列；
- 主进程上层服务不再直接依赖 Registry entry；
- Settings 页面提供 JSON 编辑器管理自定义 Agent；
- Chat 和 Workflow 的 Agent 选择器支持自定义 Agent。

**Non-Goals:**

- 不直接读取或同步 Zed/IntelliJ 的 `settings.json`；
- 不为自定义 Agent 实现 install/uninstall/update 流程；
- 不在本次变更中实现点击量、使用偏好等运行时统计；
- 不增加自定义 Agent 的安全确认弹窗或文件 watcher（仅支持设置页保存后刷新）。

## Decisions

### 1. 配置文件与 schema

**决策**：`data/acp/custom-agents.json` 采用与 Zed `agent_servers` 一致的 schema，但去除 `type` 字段。

```json
{
  "agent_servers": {
    "Kimi Code CLI": {
      "command": "~/.local/bin/kimi",
      "args": ["acp"],
      "env": {}
    }
  }
}
```

**理由**：用户从 Zed/IntelliJ 复制配置时基本可用，迁移成本低；去掉 `type` 是因为 FylloCode 当前只有 custom 一种本地类型。

### 2. Agent 标识

**决策**：自定义 Agent 的内部 id 由 `command` 与 `args` 确定性生成：

```ts
`custom-${slug(basename(command))}-${shortHash(command + args)}`;
```

**理由**：

- 不依赖用户维护 id；
- 改名不改 id，点击量和偏好数据可继承；
- 改 `command`/`args` 视为新 Agent，符合"启动方式变化即不同 Agent"的语义。

### 3. 主进程架构：Agent Catalog Service

**决策**：在主进程新增 `AgentCatalogService`，统一 Registry Domain 与 Custom Domain。

```mermaid
flowchart TD
    R[Registry Domain] --> C[Agent Catalog Service]
    D[Custom Domain] --> C
    C -->|CatalogAgent[]<br/>source: registry | custom| E[Status Detector]
    C --> F[ensureAgent]
    C --> G[Process Pool]
```

**理由**：

- 避免 detector、ensureAgent、process pool 三处各自判断来源；
- `source` 字段为上层路由提供唯一依据；
- Registry Agent 现有路径完全不动，通过 Catalog 代理即可。

Catalog 返回的统一对象形如：

```ts
interface CatalogAgent {
  id: string;
  source: "registry" | "custom";
  name: string;
  // registry 来源
  registryEntry?: AcpAgentEntry;
  // custom 来源
  customConfig?: {
    displayName: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  };
}
```

### 4. Command 路径解析

**决策**：加载 custom agent 时，对 `command` 做 `~` 展开与 PATH 查找，生成绝对路径后再用于 id 计算与启动。

**理由**：兼容 Zed/IntelliJ 示例中的 `~/.local/bin/kimi` 与简写 `kimi`；同时保证同一命令不同写法生成相同 id。

### 5. 环境变量注入

**决策**：custom agent 启动时 `env` 为 `{ ...process.env, ...customEnv }`，customEnv 同名 key 覆盖系统环境变量。

**理由**：与现有 Registry Agent 的 env 合并策略保持一致。

### 6. 状态检测

**决策**：`detectAgentStatuses` 不再直接遍历 `registry.agents`，而是遍历 `agentCatalog.listAgents()`；对 `source === 'custom'` 的 agent，通过查找解析后的绝对路径判断 `installed`。

**理由**：把 Registry-only 的检测逻辑改为 Catalog-driven，是支持自定义 Agent 的关键。

### 7. ensureAgent 与 capabilities 缓存

**决策**：

- `ensureAgent` 对 `custom-` 前缀 id 绕过 `installed.json` 检查，直接从 Catalog 获取启动配置；
- custom agent 的 capabilities 缓存 key 为 id，不依赖 `installedVersion`；
- 用户保存 `custom-agents.json` 后，清空对应 custom agent 的内存与磁盘 capabilities 缓存，下次使用时重新获取。

**理由**：custom agent 没有版本概念，不能复用按 `installedVersion` 失效的缓存策略。

### 8. Process Pool 启动

**决策**：`startProcess` 对 `custom-` 前缀 id 从 Catalog 读取 `command/args/env`，直接构造 spawn spec，不再要求 registry entry。

**理由**：自定义 Agent 的唯一启动信息就是 command/args/env。

### 9. 前端展示

**决策**：

- `useAcpAgentsStore` 新增 `allAvailableAgents` / `installedAgentIds` 从合并后的 Catalog 视图计算；
- `SettingsAgents` 增加"自定义" tab，使用 `stream-monaco` 编辑 JSON；
- `AgentPickerModal` 顶部增加 Registry/Custom tab；
- Custom tab 以卡片网格展示 custom agents，无搜索框；
- 默认图标使用 `lucide:bot`。

### 10. 数据文件职责分离

**决策**：

- `custom-agents.json`：用户自定义 Agent 定义；
- `installed.json`：Registry Agent 安装状态；
- `agent-capabilities.json`：capabilities 缓存（包含 registry 与 custom）。

**理由**：避免用户手动编辑配置时误删运行数据，也避免安装记录混入无安装流程的 custom agent。

## Risks / Trade-offs

| Risk                                               | Mitigation                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Monaco worker 配置问题导致编辑器构建后不可见       | 复用 FylloCode 已配置好的 Monaco 集成，不再额外配置 worker                                      |
| 自定义 Agent 执行任意命令的安全风险                | 本次不在 UI 层增加确认弹窗，依赖用户通过设置页显式管理配置；后续可扩展安全策略                  |
| custom agent id 冲突（相同 command/args 不同名称） | 视为同一个 Agent，列表中只展示一条；若需区分，用户需修改 command/args                           |
| command 找不到时用户困惑                           | UI 在卡片上显示"命令未找到"状态，但不阻止保存                                                   |
| 删除 custom agent 后已有 session/workflow 引用失效 | 保留 session 历史记录，但选中该 agent 时启动会报错；workflow 执行时同样报错，由用户自行修复配置 |

## Migration Plan

- 新增 `data/acp/custom-agents.json` 文件，默认内容为 `{ "agent_servers": {} }`；
- 无需迁移现有 `installed.json` 或 registry cache；
- 无需改动现有 session/workflow 数据格式。

## Open Questions

- 是否需要支持从 Zed/IntelliJ `settings.json` 一键导入？本次不做，后续可按需扩展。
- 是否需要文件 watcher 监听 `custom-agents.json` 的外部修改？本次不做，仅支持设置页保存后刷新。
