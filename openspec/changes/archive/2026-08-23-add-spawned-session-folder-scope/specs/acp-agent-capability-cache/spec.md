## MODIFIED Requirements

### Requirement: Agent 可用性只在实际需要附加目录时受限

系统 SHALL 以目标effective Session snapshot的`additionalDirectories`是否为空判断是否需要additional directories capability。空数组时`supported`、`unsupported`与`unknown` Agent均 SHALL保持可用；非空时只有`supported` Agent SHALL可启动probe、创建或恢复Agent Session。`unknown` Agent SHALL先通过既有`ensureAgent`完成initialize并重新判定，Main SHALL在每个activation入口执行最终校验。

普通Chat/probe与未显式选择Folder的spawned Session SHALL保持完整固定Workspace snapshot，Main SHALL NOT为通过compatibility gate而静默裁剪Folder或回退primary。`prompt_to_agent`首次创建显式指定父Session授权snapshot内的`folderId`时，派生的单根snapshot SHALL视为调用方选择的effective scope而非降级；该scope固定持久化且续聊不可改变。

#### Scenario: 单根 Workspace 使用不支持该能力的 Agent

- **WHEN** Session snapshot 的 `additionalDirectories` 为空且 Agent 状态为 `unsupported` 或 `unknown`
- **THEN** picker SHALL 允许选择该 Agent
- **AND** Main SHALL 允许其按单根 `cwd` 启动

#### Scenario: 多根 Workspace 使用支持该能力的 Agent

- **WHEN** Session snapshot 的 `additionalDirectories` 非空且 Agent 状态为 `supported`
- **THEN** picker SHALL 允许选择该 Agent
- **AND** probe 与 Chat activation SHALL 可继续执行

#### Scenario: 多根 Workspace 遇到未知能力

- **WHEN** Session snapshot 的 `additionalDirectories` 非空且 Agent 状态为 `unknown`
- **THEN** picker SHALL 显示“连接后检测”语义并调用既有 `ensureAgent`
- **AND** 刷新结果为 `supported` 前 SHALL NOT 启动 probe

#### Scenario: Renderer 绕过 picker

- **WHEN** renderer 对需要附加目录的 Workspace 直接请求一个 `unsupported` 或仍为 `unknown` 的 Agent activation
- **THEN** Main SHALL 以 capability mismatch 拒绝请求
- **AND** SHALL NOT 降级为只传 primary Folder

#### Scenario: Spawn调用方显式选择单Folder

- **WHEN**父Chat是multi-root Workspace且`prompt_to_agent`首次创建显式选择父snapshot内一个Folder
- **THEN**Main SHALL对派生后`additionalDirectories`为空的effective snapshot执行compatibility校验
- **AND**不支持additional directories的Agent SHALL可按所选Folder的`cwd`启动
- **AND**该行为 SHALL NOT改变普通Chat/probe的multi-root capability要求
