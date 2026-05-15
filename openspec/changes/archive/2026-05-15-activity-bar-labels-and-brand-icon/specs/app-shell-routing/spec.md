## ADDED Requirements

### Requirement: Activity Bar 采用品牌头部与常驻标签导航

Activity Bar SHALL 在共享应用外壳中采用三段式结构：顶部显示 FylloCode 品牌 icon，中部显示主导航菜单，底部显示设置入口。所有导航按钮 SHALL 直接显示图标及其文本标签，而 SHALL NOT 依赖悬浮 tooltip 才暴露导航名称。

#### Scenario: Activity Bar 显示品牌头部与菜单标签

- **WHEN** 应用在共享外壳中渲染 Activity Bar
- **THEN** 顶部显示 FylloCode 品牌 icon
- **AND** 中部主导航菜单中的每个入口都同时显示图标和常驻文本标签
- **AND** 底部设置入口显示图标和“设置”文本标签

#### Scenario: 打包后品牌 icon 仍可加载

- **WHEN** 应用以前端 `file://` 协议加载打包产物
- **THEN** Activity Bar 顶部品牌 icon 使用 `${import.meta.env.BASE_URL}icon.svg` 作为资源路径
- **AND** 品牌 icon 可在打包环境中正常显示
