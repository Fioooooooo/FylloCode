## ADDED Requirements

### Requirement: ACP 工具 location 复用本地文件预览

Renderer SHALL 让普通工具详情中的可预览 ACP location 调用现有窗口级 `useLocalFilePreview()` 公共入口。系统 SHALL 继续由既有 `workspace.document` Main contract 完成路径、Workspace 授权、文件资格与确认校验；工具组件 SHALL NOT 直接调用 `window.api`、读取文件或创建第二套预览 Slideover。

#### Scenario: 绝对 location 路径带行号

- **WHEN** 用户激活一个符合本地文件候选语法且包含 line 的工具 location
- **THEN** Renderer SHALL 以该 path 与 line 打开现有本地文件预览
- **AND** ready Monaco SHALL 定位并 reveal 对应行

#### Scenario: 绝对 location 路径不带行号

- **WHEN** 用户激活一个符合本地文件候选语法但不包含 line 的工具 location
- **THEN** Renderer SHALL 通过同一全局入口打开该文件
- **AND** SHALL 使用现有无定位预览行为

#### Scenario: location 不是本地文件候选

- **WHEN** ACP location path 不符合现有绝对本地文件候选语法
- **THEN** 工具详情 SHALL 仍以文本展示该 location
- **AND** SHALL NOT 发起本地文件预览 IPC

#### Scenario: 工具 location 与 MarkStream 链接共享预览实例

- **WHEN** 同一 Renderer Window 先后从工具 location 与 MarkStream 本地链接打开文件
- **THEN** 两个入口 SHALL 共享既有窗口级单活动预览规则
- **AND** 较新的预览 SHALL 取代较旧预览且清理旧 controller 资源
