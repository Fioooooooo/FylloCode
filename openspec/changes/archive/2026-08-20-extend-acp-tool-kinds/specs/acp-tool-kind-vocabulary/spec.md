## ADDED Requirements

### Requirement: Renderer SHALL recognize the ACP 1.3.0 tool kind vocabulary

Renderer SHALL recognize read、write、edit、delete、move、search、execute、think、fetch、switch_mode 与 other 作为 FylloCode 的 canonical 工具类型。write SHALL 作为历史兼容值保留；缺失、空白或未注册的其他字符串 SHALL 回退为 other。Main mapper 与 Shared event SHALL 保留 ACP 公共字段中的原始 kind 字符串，且 SHALL NOT 依赖 Agent ID 进行分类。

#### Scenario: ACP 1.3.0 新增 kind 被 Renderer 识别

- **WHEN** 工具 metadata 的 toolKind 分别为 delete、move、think、fetch 或 switch_mode
- **THEN** getToolKind SHALL 返回对应的 canonical kind
- **AND** 普通工具与 Activity group SHALL 使用该 kind 继续渲染

#### Scenario: 历史 write kind 保持可见

- **WHEN** 历史工具 metadata 的 toolKind 为 write
- **THEN** getToolKind SHALL 返回 write
- **AND** 工具 SHALL 继续使用 Write 语义展示

#### Scenario: 未知 kind 安全回退

- **WHEN** 工具 metadata 的 toolKind 缺失、为空白或是未注册的字符串
- **THEN** getToolKind SHALL 返回 other
- **AND** 工具 SHALL 使用通用工具图标和摘要
- **AND** 系统 SHALL NOT 根据 title、toolName、input、output 或 Agent 身份猜测其他 kind

#### Scenario: fetch 保留资源获取语义

- **WHEN** ACP update 的公共 kind 为 fetch
- **THEN** mapper 到 Shared event 的 toolKind SHALL 保留为 fetch
- **AND** Renderer SHALL NOT 将其归类为 search 或 other

### Requirement: Each canonical tool kind SHALL have stable icon and activity presentation

Renderer SHALL 为每个 canonical tool kind 提供稳定的 Lucide 图标和 Activity 摘要映射。新增图标 SHALL 遵守现有 IconConventions；同一工具 part 在直接展示和 Activity group 中 SHALL 使用相同的 kind 图标。

#### Scenario: New kind has a semantic icon

- **WHEN** 用户查看 delete、move、think、fetch 或 switch_mode 工具
- **THEN** 工具 leading icon SHALL 表达对应的删除、移动、思考、获取资源或切换模式语义
- **AND** icon mapping SHALL 不依赖 Agent ID

#### Scenario: Activity summary includes new kinds

- **WHEN** Activity group 包含新增 kind
- **THEN** 摘要 SHALL 使用 Delete file、Move file、Think time、Fetch resource 或 Switch mode 的对应动词和名词
- **AND** 计数、复数和首次出现顺序 SHALL 遵守现有 Activity summary 规则

#### Scenario: Tool think shares Think category with reasoning

- **WHEN** Activity group 同时包含 reasoning part 与 think tool part
- **THEN** 两者 SHALL 计入同一个 Think 类别
- **AND** 原始 part 类型、顺序和详情内容 SHALL 保持可区分
