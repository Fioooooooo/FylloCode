## ADDED Requirements

### Requirement: 用户呈现术语与内部 Workspace 模型解耦

所有面向最终用户的 renderer、原生对话框、toast、空态、状态、操作、辅助功能文本和可见错误 SHALL 使用独立的呈现术语：内部 `kind: "folder"` 的顶层对象 SHALL 呈现为 `Project`，内部 `kind: "collection"` 的顶层对象 SHALL 呈现为 `Workspace`。Workspace member、repository owner、筛选 owner 和 automation target 中的内部 Folder SHALL 呈现为 `Project`；当语义指向物理 path、选择器、missing 或 relocation 时 SHALL 使用“项目目录”。

呈现术语 SHALL 由对象语义和 `WorkspaceKind` 决定，不得由 Folder 数量、Git 探测结果、当前 primary 或页面局部习惯推断。Project MAY 对应非 Git 工程目录；repository-only 能力 SHALL 继续独立表达 Git 可用性。

#### Scenario: Folder kind 呈现为 Project

- **WHEN** 任一用户界面展示 `kind: "folder"` 的顶层对象
- **THEN** 该对象的类型、操作和状态 SHALL 使用 `Project`
- **AND** SHALL NOT 向用户显示 `Folder Workspace` 或把它称为 Workspace

#### Scenario: 单成员 Collection 仍呈现为 Workspace

- **WHEN** 用户界面展示只有一个 Folder member 的 `kind: "collection"` 对象
- **THEN** 该对象 SHALL 继续呈现为 `Workspace`
- **AND** SHALL NOT 根据 member 数量改称 Project 或“单文件夹工作区”

#### Scenario: Repository owner 呈现为 Project

- **WHEN** Specs、Guidelines、Proposal、Overview、Task、Integration 或其他 repository-owned 界面展示 Folder owner、filter、target 或 partial state
- **THEN** 用户可见名词 SHALL 使用 `Project`
- **AND** 内部 `folderId`、`ProposalRef`、`SpecRef`、`GuidelineRef` 和 owner 校验 SHALL 保持不变

#### Scenario: Path 操作使用项目目录

- **WHEN** 用户选择、查看、修复或重新定位 Project 对应的 filesystem path
- **THEN** 操作与错误 SHALL 将该 path 称为“项目目录”
- **AND** SHALL NOT 将 Project identity 与当前 path 等同

### Requirement: 动态与共同界面不得误用内部上位概念

已知目标 kind 的用户界面 SHALL 动态使用 Project 或 Workspace。列表、switcher、删除恢复管理、未选择状态或其他同时覆盖两种 kind 的共同界面 SHALL 使用不会把 Project 误称为 Workspace 的中性文案，或明确并列 `Project 或 Workspace`；不得使用内部 Workspace 上位概念作为两种用户对象的统一展示名。

#### Scenario: 共同列表包含两种 kind

- **WHEN** 同一用户列表同时包含 folder kind 与 collection kind
- **THEN** 列表标题和共同操作 SHALL 使用中性语义
- **AND** 每个具体对象 SHALL 按自己的 kind 显示 Project 或 Workspace

#### Scenario: 已知 kind 的确认操作

- **WHEN** 用户编辑、删除、恢复或永久清理一个 kind 已知的对象
- **THEN** 标题、说明、确认按钮和结果提示 SHALL 使用该对象对应的 Project 或 Workspace
- **AND** SHALL NOT 使用固定的 Workspace 文案覆盖两种 kind

#### Scenario: kind 尚不可用

- **WHEN** 启动、导航或错误边界需要提示用户但无法获得目标 kind
- **THEN** 文案 SHALL 使用中性语义或明确并列 Project 与 Workspace
- **AND** SHALL NOT 猜测目标为 Project、Workspace 或 primary Project

### Requirement: 内部术语和状态不得未经投影直接展示

内部 `Folder Workspace`、`Collection Workspace`、`Folder`、`folder | collection`、cleanup state、error message 和结构化 identity MAY 继续用于源码、OpenSpec 内部不变量、IPC/schema、storage、migration、MCP/Agent contract、日志和诊断，但 SHALL NOT 未经 presentation boundary 直接成为最终用户文案。用户错误 SHALL 优先依据结构化 error code 与已知 kind 投影；内部 message 和 details MAY 用于日志或显式技术详情，但不得承担主要用户说明。

#### Scenario: Cleanup state 投影为用户状态

- **WHEN** lifecycle UI 获得 `restorable`、`purging` 或 `cleanup-failed`
- **THEN** UI SHALL 显示可理解的恢复、清理中或清理失败状态
- **AND** SHALL NOT 直接渲染 raw enum value

#### Scenario: Main 返回内部术语错误

- **WHEN** renderer 收到包含 Folder、Collection 或内部 Workspace 上位概念的结构化错误
- **THEN** 用户可见主消息 SHALL 由 error code 和呈现上下文生成
- **AND** 内部 error code、details 和日志诊断 SHALL 保持原值

#### Scenario: Agent contract 保持内部 identity

- **WHEN** Main 构造 MCP descriptor、Session snapshot、Agent system reminder 或 repository owner contract
- **THEN** contract SHALL 继续使用 Workspace/Folder identity 和字段名
- **AND** 本呈现规范 SHALL NOT 将 Project/Workspace 用户文案写入这些内部协议字段

### Requirement: 新增用户界面受统一规范和自动检查约束

Renderer SHALL 提供单一 Project/Workspace 呈现映射入口，kind-sensitive 用户界面 SHALL 复用该入口而不是各自复制 `kind` 判断或核心术语。项目 guideline SHALL 记录同一规则；质量门禁 SHALL 自动拒绝用户文案重新引入内部 Folder/Collection 叫法或 raw lifecycle state，并以 Project/Workspace 两种 kind 的代表性测试验证动态呈现。

自动检查 SHALL 基于禁止的内部呈现语义和 UI sink，而不是保存全部允许句子的穷尽清单。确属 Agent-facing、协议或诊断的字符串 SHALL 通过显式的非用户语境声明排除，不得依赖不断增长的文件级 allowlist。

#### Scenario: 新组件复用 kind 映射

- **WHEN** 开发者新增一个同时展示 folder kind 与 collection kind 的用户组件
- **THEN** 组件 SHALL 通过统一入口获得 Project/Workspace 类型名
- **AND** 测试 SHALL 证明两种 kind 不会被同一个固定名词覆盖

#### Scenario: 新用户文案包含内部术语

- **WHEN** renderer 新增用户可见文案并直接使用 Folder Workspace、Collection Workspace 或作为展示名的 Folder/Collection
- **THEN** lint 或等价自动化质量门禁 SHALL 失败
- **AND** 修复 SHALL 使用呈现映射或符合语义的中性文案

#### Scenario: 非用户协议字符串保留内部术语

- **WHEN** renderer source 必须构造 Agent-facing 或诊断字符串并使用内部 Folder/Workspace 术语
- **THEN** source SHALL 显式声明该字符串不是用户文案
- **AND** 自动检查 SHALL 允许该受审查的内部语境而不放宽普通 UI 文案规则
