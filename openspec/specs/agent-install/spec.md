# agent-install 规范

## Purpose

管理 CLI agent 的安装流程，支持 npx、uvx、binary 三种分发类型，并维护安装记录。

## Requirements

### Requirement: Agent 安装状态检测

主进程 SHALL 通过 `acp:detectStatus` 检测系统中每个 **Catalog Agent** 的安装状态，返回 `AcpAgentStatus[]`，每项包含 `id`、`installed`、`detectedVersion`（可选）、`managedBy`（`"fyllocode" | "user" | null`）。Catalog Agent 包含 Registry Agent 与 Custom Agent 两类。

#### Scenario: 检测到自定义 Agent 已安装

- **WHEN** 调用 `detectStatus`，且某 custom agent 的 command 经 `~` 展开和 PATH 解析后指向存在的可执行文件
- **THEN** 返回 `installed: true, managedBy: null, detectedVersion: undefined`

#### Scenario: 检测到自定义 Agent 未安装

- **WHEN** 调用 `detectStatus`，且某 custom agent 的 command 无法解析或指向文件不存在
- **THEN** 返回 `installed: false, managedBy: null`

#### Scenario: Registry Agent 检测行为保持不变

- **WHEN** 调用 `detectStatus` 检测 Registry Agent
- **THEN** 返回结果与变更前一致，包括 `managedBy` 与 `detectedVersion` 语义

#### Scenario: 检测到已安装（FylloCode 管理）

- **WHEN** 调用 `detectStatus`，且 `installed.json` 中存在该 agent 记录，且对应命令/文件在系统中可找到
- **THEN** 返回 `installed: true, managedBy: "fyllocode", detectedVersion: <版本号>`

#### Scenario: 检测到已安装（用户自行安装）

- **WHEN** 调用 `detectStatus`，且系统中可找到该 agent 命令，但 `installed.json` 中无记录
- **THEN** 返回 `installed: true, managedBy: "user", detectedVersion: <版本号>`，并在 `installed.json` 中写入 `managedBy: "user"` 记录

#### Scenario: 未安装

- **WHEN** 调用 `detectStatus`，且系统中找不到该 agent 命令/文件
- **THEN** 返回 `installed: false, managedBy: null`

### Requirement: 安装 npx 类型 agent

主进程 SHALL 通过 `npm install -g <package>` 安装 `distribution.npx` 类型的 agent，安装前检测 npm 环境，安装过程中通过 `acp:installProgress` 推送进度，完成后写入 `installed.json`。

#### Scenario: npm 环境缺失

- **WHEN** 调用 `acp:install`，agent 为 npx 类型，且系统中找不到 npm
- **THEN** 返回错误 `{ code: "ENV_MISSING", message: "需要先安装 Node.js" }`，不执行安装

#### Scenario: 安装成功

- **WHEN** 调用 `acp:install`，agent 为 npx 类型，npm 可用
- **THEN** 执行 `npm install -g <package>`，推送 `{ agentId, status: "installing", message: "正在安装..." }`；完成后推送 `{ agentId, status: "done" }`，并在 `installed.json` 写入 `{ managedBy: "fyllocode", installMethod: "npx", installedVersion, installedAt }`

#### Scenario: 安装失败

- **WHEN** `npm install -g` 命令以非零退出码结束
- **THEN** 推送 `{ agentId, status: "error", message: <stderr 摘要> }`，不写入 `installed.json`

### Requirement: 安装 uvx 类型 agent

主进程 SHALL 通过 `uv tool install <package>` 安装 `distribution.uvx` 类型的 agent，安装前检测 uv 环境。

#### Scenario: uv 环境缺失

- **WHEN** 调用 `acp:install`，agent 为 uvx 类型，且系统中找不到 uv
- **THEN** 返回错误 `{ code: "ENV_MISSING", message: "需要先安装 uv" }`，不执行安装

#### Scenario: 安装成功

- **WHEN** 调用 `acp:install`，agent 为 uvx 类型，uv 可用
- **THEN** 执行 `uv tool install <package>`，推送进度；完成后写入 `installed.json`，`installMethod: "uvx"`

### Requirement: 安装 binary 类型 agent

主进程 SHALL 根据当前平台（`process.platform + process.arch`）选择对应 archive，下载到临时文件后解压至 `getDataSubPath('acp')/bin/<agent-id>/`，完成后写入 `installed.json`。

#### Scenario: 当前平台无对应 binary

- **WHEN** 调用 `acp:install`，agent 为 binary 类型，但 `distribution.binary` 中无当前平台的 entry
- **THEN** 返回错误 `{ code: "PLATFORM_UNSUPPORTED", message: "当前平台不支持此安装方式" }`

#### Scenario: 下载并安装成功

- **WHEN** 调用 `acp:install`，agent 为 binary 类型，当前平台有对应 entry
- **THEN** 下载 archive 到临时文件，推送 `{ agentId, status: "downloading" }`；解压到 `getDataSubPath('acp')/bin/<agent-id>/`，推送 `{ agentId, status: "installing" }`；完成后推送 `{ agentId, status: "done" }`，写入 `installed.json`，`installMethod: "binary", installPath: <解压路径>`

#### Scenario: 下载中断

- **WHEN** binary 下载过程中网络中断
- **THEN** 清理临时文件，推送 `{ agentId, status: "error", message: "下载失败，请重试" }`，不写入 `installed.json`

### Requirement: 并发安装限制

同一时间 SHALL 只允许一个 agent 处于"安装中"或"卸载中"状态。安装与卸载共用同一把互斥锁，互相之间也互斥。

#### Scenario: 尝试并发安装

- **WHEN** 已有 agent 正在安装时，调用 `acp:install` 安装另一个 agent
- **THEN** 返回错误 `{ code: "INSTALL_BUSY", message: "请等待当前操作完成" }`

#### Scenario: 尝试在安装中卸载

- **WHEN** 已有 agent 正在安装时，调用 `acp:uninstall` 卸载任意 agent
- **THEN** 返回错误 `{ code: "INSTALL_BUSY", message: "请等待当前操作完成" }`

#### Scenario: 尝试在卸载中安装

- **WHEN** 已有 agent 正在卸载时，调用 `acp:install` 安装任意 agent
- **THEN** 返回错误 `{ code: "INSTALL_BUSY", message: "请等待当前操作完成" }`

#### Scenario: 尝试并发卸载

- **WHEN** 已有 agent 正在卸载时，调用 `acp:uninstall` 卸载另一个 agent
- **THEN** 返回错误 `{ code: "INSTALL_BUSY", message: "请等待当前操作完成" }`

### Requirement: 卸载入口可见性

设置页 SHALL 仅在 `AcpAgentStatus.installed === true` 时提供卸载操作项。卸载操作项可呈现为 kebab（`...`）菜单中的菜单项，不要求是常驻并排按钮。卸载操作项 SHALL 在另一个 agent 处于安装中或卸载中状态时禁用，禁用时通过 tooltip 提示"其他 Agent 正在处理中"。**Custom Agent 不展示卸载操作项，因为它不存在安装流程。**

#### Scenario: 自定义 Agent 卡片不展示卸载入口

- **WHEN** 渲染一个 custom agent 卡片
- **THEN** SHALL 不渲染 kebab 菜单及卸载操作项

#### Scenario: agent 未安装

- **WHEN** `AcpAgentStatus.installed === false`
- **THEN** 不提供卸载操作项（不渲染卸载菜单项，且当无其它次操作时不渲染 kebab 菜单入口）

#### Scenario: agent 已安装且无并发操作

- **WHEN** `AcpAgentStatus.installed === true`，且当前没有任何 agent 处于 `installing` / `downloading` / `uninstalling` 状态
- **THEN** 提供可点击的卸载操作项（位于 kebab 菜单内）

#### Scenario: agent 已安装但其他 agent 处于安装中或卸载中

- **WHEN** `AcpAgentStatus.installed === true`，且存在另一个 agent 的 progress 状态为 `installing` / `downloading` / `uninstalling`
- **THEN** 卸载操作项渲染但处于禁用态，hover 时提示"其他 Agent 正在处理中"

### Requirement: 卸载二次确认对话框

点击卸载按钮 SHALL 弹出二次确认对话框，文案根据 `(managedBy, installMethod)` 组合渲染，并明确展示即将执行的命令或要删除的路径。

对话框 SHALL 包含：标题（"卸载 {agent.name}？"）、说明文本、命令/路径展示块、脚注、主按钮、取消按钮。命令/路径展示块使用等宽字体并加边框背景以与正文区分。

#### Scenario: FylloCode 安装的 npx 类型 agent

- **WHEN** 点击卸载按钮，且 `managedBy === "fyllocode"`、`installMethod === "npx"`
- **THEN** 对话框正文展示"该 Agent 由 FylloCode 安装，确定卸载吗？"，命令展示块内容为 `npm uninstall -g <package>`（其中 `<package>` 取自 `agent.distribution.npx.package`），脚注为"卸载完成后将清除本地安装记录。"，主按钮文案为"卸载"，颜色为 error

#### Scenario: FylloCode 安装的 uvx 类型 agent

- **WHEN** 点击卸载按钮，且 `managedBy === "fyllocode"`、`installMethod === "uvx"`
- **THEN** 对话框正文展示"该 Agent 由 FylloCode 安装，确定卸载吗？"，命令展示块内容为 `uv tool uninstall <package>`（其中 `<package>` 取自 `agent.distribution.uvx.package`），脚注为"卸载完成后将清除本地安装记录。"，主按钮文案为"卸载"

#### Scenario: FylloCode 安装的 binary 类型 agent

- **WHEN** 点击卸载按钮，且 `managedBy === "fyllocode"`、`installMethod === "binary"`
- **THEN** 对话框正文展示"该 Agent 由 FylloCode 安装，确定卸载吗？"，路径展示块内容为 `<userData>/acp/bin/<agent.id>`（其中 `<userData>` 为 `app.getPath('userData')` 的真实路径），脚注为"卸载完成后将清除本地安装记录。"，主按钮文案为"卸载"

#### Scenario: 用户自行安装的 npx 类型 agent

- **WHEN** 点击卸载按钮，且 `managedBy === "user"`、`installMethod === "npx"`
- **THEN** 对话框正文展示"该 Agent 由你自行安装，是否同意 FylloCode 代为卸载？"，命令展示块内容为 `npm uninstall -g <package>`，脚注为"此操作会修改你的全局环境，不可撤销。"，主按钮文案为"同意并卸载"，颜色为 warning

#### Scenario: 用户自行安装的 uvx 类型 agent

- **WHEN** 点击卸载按钮，且 `managedBy === "user"`、`installMethod === "uvx"`
- **THEN** 对话框正文展示"该 Agent 由你自行安装，是否同意 FylloCode 代为卸载？"，命令展示块内容为 `uv tool uninstall <package>`，脚注为"此操作会修改你的全局环境，不可撤销。"，主按钮文案为"同意并卸载"

#### Scenario: 用户自行安装的 binary 类型 agent

- **WHEN** 点击卸载按钮，且 `managedBy === "user"`、`installMethod === "binary"`
- **THEN** 对话框正文展示"该 Agent 由你自行安装，是否同意 FylloCode 代为卸载？"，路径展示块内容为 `<userData>/acp/bin/<agent.id>`，脚注为"此操作不可撤销。"，主按钮文案为"同意并卸载"

#### Scenario: 取消卸载

- **WHEN** 用户在对话框点击"取消"
- **THEN** 关闭对话框，不调用 `acp:uninstall`，不修改任何状态

### Requirement: 卸载 npx 类型 agent

主进程 SHALL 通过 `npm uninstall -g <package>` 卸载 `installMethod === "npx"` 的 agent，卸载前检测 npm 环境，卸载过程中通过 `acp:uninstallProgress` 推送进度。

#### Scenario: npm 环境缺失

- **WHEN** 调用 `acp:uninstall`，agent 的 `installMethod === "npx"`，且系统中找不到 npm
- **THEN** 返回错误 `{ code: "ENV_MISSING", message: "需要先安装 Node.js" }`，不执行卸载，不修改 `installed.json`

#### Scenario: 卸载成功

- **WHEN** 调用 `acp:uninstall`，agent 的 `installMethod === "npx"`，npm 可用，命令以退出码 0 结束
- **THEN** 推送 `{ agentId, status: "uninstalling", message: "正在卸载..." }`；完成后推送 `{ agentId, status: "done" }`，从 `installed.json` 删除该 agentId 条目，从 `agent-capabilities.json` 删除该 agentId 的能力缓存

#### Scenario: 卸载失败

- **WHEN** `npm uninstall -g <package>` 命令以非零退出码结束
- **THEN** 推送 `{ agentId, status: "error", message: <stderr 摘要> }`，抛出 `{ code: "UNINSTALL_FAILED", message: <stderr 摘要> }`，**不**修改 `installed.json`，**不**修改 `agent-capabilities.json`

### Requirement: 卸载 uvx 类型 agent

主进程 SHALL 通过 `uv tool uninstall <package>` 卸载 `installMethod === "uvx"` 的 agent，卸载前检测 uv 环境。

#### Scenario: uv 环境缺失

- **WHEN** 调用 `acp:uninstall`，agent 的 `installMethod === "uvx"`，且系统中找不到 uv
- **THEN** 返回错误 `{ code: "ENV_MISSING", message: "需要先安装 uv" }`，不执行卸载，不修改 `installed.json`

#### Scenario: 卸载成功

- **WHEN** 调用 `acp:uninstall`，agent 的 `installMethod === "uvx"`，uv 可用，命令以退出码 0 结束
- **THEN** 推送进度，完成后从 `installed.json` 删除该 agentId 条目，从 `agent-capabilities.json` 删除该 agentId 缓存

#### Scenario: 卸载失败

- **WHEN** `uv tool uninstall <package>` 命令以非零退出码结束
- **THEN** 推送 `{ agentId, status: "error" }`，抛错，不修改任何记录

### Requirement: 卸载 binary 类型 agent

主进程 SHALL 通过 `fs.rm(targetDir, { recursive: true, force: true })` 删除 `<userData>/acp/bin/<agent.id>/` 整个目录来卸载 `installMethod === "binary"` 的 agent。

主进程 SHALL 在执行 `fs.rm` 前断言 `agent.id` 仅包含 `[A-Za-z0-9_-]` 字符且非空，以防止路径穿越；不满足时返回错误 `{ code: "INVALID_AGENT_ID" }`，不执行任何文件操作。

#### Scenario: 删除成功

- **WHEN** 调用 `acp:uninstall`，agent 的 `installMethod === "binary"`，目标目录存在
- **THEN** 推送 `{ agentId, status: "uninstalling" }`；删除 `<userData>/acp/bin/<agent.id>/` 后推送 `{ agentId, status: "done" }`，从 `installed.json` 删除条目，从 `agent-capabilities.json` 删除缓存

#### Scenario: 目标目录不存在

- **WHEN** 调用 `acp:uninstall`，agent 的 `installMethod === "binary"`，目标目录已不存在（手动删过）
- **THEN** 视为卸载成功（`fs.rm` 配合 `force: true` 不抛错），照常清理 `installed.json` 与 `agent-capabilities.json`

#### Scenario: 删除失败

- **WHEN** `fs.rm` 抛出非 `ENOENT` 错误（如权限拒绝）
- **THEN** 推送 `{ agentId, status: "error", message: <错误摘要> }`，抛出 `{ code: "UNINSTALL_FAILED" }`，不修改任何记录

### Requirement: 卸载 IPC 契约

`acp:uninstall` 通道 SHALL 接受 `agentId: string`（非空）作为输入参数，校验通过 `uninstallAgentInputSchema = z.string().min(1)`。**Custom Agent id 以 `custom-` 前缀开头，调用 `acp:uninstall` 时 SHALL 返回错误 `{ code: "AGENT_NOT_FOUND" }`，因为自定义 Agent 不存在安装记录。**

#### Scenario: 输入参数为空

- **WHEN** 调用 `acp:uninstall` 时传入空字符串或 `undefined`
- **THEN** schema 校验失败，返回错误，不进入业务逻辑

#### Scenario: agent 是自定义 Agent

- **WHEN** 调用 `acp:uninstall` 传入以 `custom-` 开头的 agentId
- **THEN** 返回错误 `{ code: "AGENT_NOT_FOUND", message: "自定义 Agent 不支持卸载操作" }`

#### Scenario: agent 未在 registry 中

- **WHEN** 调用 `acp:uninstall` 传入的 agentId 在 registry 中找不到
- **THEN** 返回错误 `{ code: "AGENT_NOT_FOUND", message: "未知 Agent: <agentId>" }`

#### Scenario: agent 在 registry 但 installed.json 中无记录

- **WHEN** 调用 `acp:uninstall` 时该 agent 的 `installed.json` 条目不存在
- **THEN** 返回错误 `{ code: "AGENT_NOT_FOUND", message: "Agent <agentId> is not installed" }`
