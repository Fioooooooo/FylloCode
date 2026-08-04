## ADDED Requirements

### Requirement: Project 与 Workspace 类型图标保持一致

当用户界面使用图标表达顶层对象类型时，Folder Workspace 对应的 Project SHALL 使用 Lucide folder 图标，Collection Workspace 对应的 Workspace SHALL 使用 Lucide `layout-grid` 图标。AppHeader 的当前对象、最近打开项以及 Launcher/Welcome 中创建或管理 Workspace 的入口 SHALL 使用同一映射；系统 SHALL NOT 使用 `layers-3` 表达 Workspace。

类型图标 SHALL 与可见的 Project/Workspace 文字或等价辅助功能名称共同出现，不得作为唯一类型说明。表示动作的 folder-open 图标 MAY 继续用于“打开 Project…”，不得因此改变 Project 的类型图标映射。

#### Scenario: AppHeader 区分 Project 与 Workspace

- **WHEN** AppHeader 展示 Project 和 Workspace 的当前对象或最近打开项
- **THEN** Project SHALL 使用 folder 类型图标
- **AND** Workspace SHALL 使用 `layout-grid` 类型图标
- **AND** 每个 item SHALL 同时显示 Project 或 Workspace 类型文字

#### Scenario: Workspace 创建和管理入口使用一致图标

- **WHEN** Launcher/Welcome 或 AppHeader 展示“创建 Workspace”或“管理 Project 与 Workspace…”入口
- **THEN** 入口 SHALL 使用 `layout-grid` 图标延续 Workspace 语义
- **AND** SHALL NOT 在这些入口使用 `layers-3`

#### Scenario: 打开 Project 使用动作图标

- **WHEN** 用户界面展示“打开 Project…”操作
- **THEN** 操作 MAY 使用 folder-open 图标表达打开动作
- **AND** Project 对象本身的类型图标 SHALL 继续使用 folder
