## Context

现有 lineage 数据模型已经将项目级 lineage 写入 FylloCode userData 的项目数据目录下：`<userData>/projects/<encodedProjectPath>/lineage/`。其中 `subjects/<subjectId>.json` 是权威源，`index.json` 提供 `proposals` 与 `commitHashes` 反查表。主进程负责 lineage 写入与事件消费，MCP server 作为独立 stdio 进程运行，不应依赖 Electron API 或 `@main/*`。

当前 bundled MCP env 已有 `FYLLO_PROJECT_PATH` 和 `FYLLO_MCP_EVENT_DIR`。`FYLLO_PROJECT_PATH` 指向项目源码目录，适合读取 OpenSpec 状态；`FYLLO_MCP_EVENT_DIR` 是 proposal event 队列目录，不应该被 lineage 查询 tool 反向用于推导数据目录。本次新增 `FYLLO_PROJECT_DATA_DIR`，让主进程把经 `getDataSubPath` 解析后的项目数据根目录显式传给 MCP server。

## Goals / Non-Goals

**Goals:**

- 为 `fyllo-cortex` 增加只读 `lineage` tool，让 agent 能按 proposal changeId 或完整 commit hash 查询 lineage。
- 通过 `FYLLO_PROJECT_DATA_DIR` 明确传递当前项目数据目录，避免 MCP server 复制 `getDataSubPath`、`encodeProjectPath` 或 userData 环境判断。
- 保持 lineage index 为查询权威入口，查询行为简单、可预测、不会修改磁盘状态。
- 返回面向 agent 使用的固定 DTO，隐藏内部 `Subject` / `TaskItem` 的完整持久化细节。

**Non-Goals:**

- 不在 archive 阶段写回 `LineageProposalLink.commitHash`；现有 overview 懒查询/懒写回策略保持不变。
- 不在 `lineage` tool 中运行 Git 查询或补全 commit hash。
- 不在 `lineage` tool 中扫描 `subjects/*.json` 重建 index，也不写回 `index.json`。
- 不新增 main <-> MCP RPC 通道。
- 不迁移 lineage 存储位置；lineage 仍位于 FylloCode userData 的项目数据目录下。

## Decisions

### 决策 1：新增 `FYLLO_PROJECT_DATA_DIR`，而不是复用 `FYLLO_MCP_EVENT_DIR`

`FYLLO_MCP_EVENT_DIR` 的语义是 MCP proposal event 队列目录，用它 `dirname(...)` 推导项目数据目录会把查询 tool 绑定到事件机制的目录布局。新增 `FYLLO_PROJECT_DATA_DIR` 让主进程直接暴露当前项目数据根目录，语义清晰，也避免未来事件目录调整影响 lineage 查询。

备选：让 `fyllo-cortex` 根据 `FYLLO_PROJECT_PATH` 自己编码路径。否决，因为 dev/prod userData 根路径由 `getDataSubPath` 控制，MCP server 不应复制主进程路径策略。

### 决策 2：`lineage` tool 把 `index.json` 当作唯一反查入口

`index.json` 已经包含 `proposals` 和 `commitHashes` 两类反查表。本 tool 的目标是查询主进程已经收集到的 lineage，而不是修复或补全 lineage。如果 `index.json` 缺失、损坏或没有命中，tool 返回 `null`。

备选：缺失 index 时扫描 `subjects/*.json` 内存重建。否决，因为这会让 tool 的结果不同于主进程当前发布的 index 状态，也会把自愈逻辑复制到 MCP server。

### 决策 3：tool 只读文件，不做 Git fallback 或 lineage 写回

`trace-commit` 只查 `index.commitHashes[commitHash]`。如果 overview 尚未懒写回某个归档 commit hash，该 commit 查询返回 `null`。这是有意行为，因为 lineage 是 tool 的权威数据源，Git fallback 会把查询工具变成另一个 lineage 收集者。

备选：在 tool 内复用 overview 的 archive commit index 算法。否决，因为这会引入 Git 子进程、归档目录解析和潜在写回时序问题，超出只读查询边界。

### 决策 4：状态字段在 tool 内按轻量规则派生

返回 DTO 中 proposal status 不是 `Subject` 原生字段。tool 应按固定规则派生：

- proposal link 有 `commitHash` 时为 `"completed"`；
- 否则，如果 `FYLLO_PROJECT_PATH/openspec/changes/<changeId>/.openspec.yaml` 的 `status` 为 `applying`，为 `"applying"`；
- 其他为 `"pending"`。

该规则不扫描归档 Git 历史，不尝试识别短 SHA。它只表达 lineage 当前已知信息和项目源码目录中的 active change 状态。

## Risks / Trade-offs

- `trace-commit` 在 overview 尚未懒写回 commit hash 前可能返回 `null`。这是接受的权衡；tool 明确只暴露 lineage 权威源，不主动补全。
- `index.json` 损坏时 tool 不自愈，可能比主进程 service 查询更保守。缓解方式是把这种情况定义为 `null`，保持 tool 无副作用。
- MCP server 侧需要少量只读 normalize/投影逻辑，和主进程 storage normalize 存在相似代码。缓解方式是限定字段范围，只投影本 tool 需要的 DTO，避免复制完整 storage 能力。
