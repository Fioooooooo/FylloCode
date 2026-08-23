## ADDED Requirements

### Requirement: Inspection投影并展示持久化的Session scope

Main owner-scoped spawned Session list/detail summary SHALL返回从持久化meta归一化得到的discriminated scope，且只包含显示所需的`workspace | folder`类型、对应opaque identity与名称，不得返回effective snapshot、`cwd`、`additionalDirectories`或其他绝对path。list与detail SHALL对同一Session返回相同scope；scope是Session级事实，不随Turn selector、运行状态或当前Workspace primary变化。

spawned Session详情Slideover SHALL在header中以文字与语义icon显示`Workspace · <名称>`或`Folder · <名称>`。该展示 SHALL在running、idle、error、expired、interrupted及历史Session中保持可见；loading或`not_found`且没有可信summary时不得猜测scope。Renderer SHALL直接消费Main summary投影，不得从Folder数量、当前Workspace store或路径推断是默认Workspace继承还是显式Folder选择。

#### Scenario: 展示完整Workspace scope

- **WHEN**用户打开一个默认继承完整父Workspace的spawned Session详情
- **THEN**summary SHALL返回`workspace`类型和持久化Workspace名称
- **AND**Slideover SHALL显示`Workspace · <名称>`及Workspace语义icon

#### Scenario: 展示显式Folder scope

- **WHEN**用户打开一个首次创建时指定`folderId`的spawned Session详情
- **THEN**summary SHALL返回`folder`类型、对应folderId和持久化Folder名称
- **AND**Slideover SHALL显示`Folder · <名称>`及Folder语义icon

#### Scenario: 切换Turn不改变scope

- **WHEN**一个Folder-scoped Session包含多个Turns且用户在Turn selector中切换
- **THEN**header SHALL继续显示同一Folder scope
- **AND** SHALL不从选中Turn或当前Workspace重新计算scope

#### Scenario: 历史错误Session仍显示scope

- **WHEN**spawned Session已error、expired或因应用重启interrupted，但owner-scoped detail仍为ready
- **THEN**Slideover SHALL同时显示持久化scope与当前状态
- **AND** SHALL不因Agent不可用或Turn terminal隐藏scope
