# workspace-layout 规范

## Purpose

工作区布局定义了 Chat 页面的五区域布局结构，由共享应用外壳与 Chat 专属内容组合而成。

## Requirements

### Requirement: 工作区页面采用五区域布局

系统 SHALL 通过将共享应用外壳与 Chat 专属内容组合来渲染 Chat 体验，其中共享外壳提供顶部 header 和左侧活动栏，Chat 页面提供左侧侧边栏、中央主区域和右侧 Diff 面板。共享应用外壳 header 的固定高度 SHALL 为 35px。

#### Scenario: 完整桌面布局

- **WHEN** 用户处于 `/chat` 路由
- **THEN** 共享应用外壳的 header 和活动栏可见
- **AND** 共享应用外壳 header 高度为 35px
- **AND** Chat 侧边栏和中央主区域以默认尺寸可见

#### Scenario: Diff 面板按需显示

- **WHEN** 用户在 Chat 中打开文件 diff
- **THEN** 右侧 Diff 面板显示在中央主区域旁边

### Requirement: 布局区域响应式调整

系统 SHALL 保持 Chat 布局针对桌面使用优化，确保可选面板关闭时中央主区域始终占据最大可用空间。

#### Scenario: Diff 面板关闭后中央区域扩展

- **WHEN** 右侧 Diff 面板关闭
- **THEN** 中央主区域扩展以填充释放的空间

#### Scenario: 侧边栏在 Chat 中保持可见

- **WHEN** 用户处于 `/chat` 路由
- **THEN** 左侧侧边栏作为桌面 Chat 布局的一部分保持可见
