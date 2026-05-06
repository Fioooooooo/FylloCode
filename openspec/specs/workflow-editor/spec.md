# workflow-editor 规范

## Purpose

Workflow 编辑器提供 YAML 高亮编辑、格式校验和内置模板复制保存能力。

## Requirements

### Requirement: YAML 编辑器支持语法高亮

系统 SHALL 在 workflow 详情区的 YAML 编辑区域使用 CodeMirror 编辑器，提供 YAML 语法高亮。

#### Scenario: 打开 workflow 详情时显示高亮编辑器

- **WHEN** 用户选择一个 workflow 模板
- **THEN** 详情区右侧显示 CodeMirror YAML 编辑器
- **AND** YAML 内容以语法高亮方式呈现（关键字、字符串、数字等颜色区分）

#### Scenario: 内置模板编辑器为只读

- **WHEN** 用户选择一个内置 workflow 模板
- **THEN** YAML 编辑器处于只读模式，不可输入
- **AND** 编辑器视觉上有只读状态提示

#### Scenario: 自定义模板编辑器可编辑

- **WHEN** 用户选择一个自定义 workflow 模板
- **THEN** YAML 编辑器处于可编辑模式
- **AND** 用户可在编辑器中直接修改 YAML 内容

### Requirement: 保存时校验 YAML 格式

系统 SHALL 在用户点击保存按钮时校验 YAML 格式，格式非法时阻止保存并提示错误。

#### Scenario: YAML 格式合法时保存成功

- **WHEN** 用户点击"保存 YAML"按钮
- **AND** 编辑器中的 YAML 内容格式合法
- **THEN** 系统执行保存操作
- **AND** 保存成功后不展示 toast 提示

#### Scenario: YAML 格式非法时阻止保存

- **WHEN** 用户点击"保存 YAML"按钮
- **AND** 编辑器中的 YAML 内容存在语法错误
- **THEN** 系统不执行保存操作
- **AND** 以 toast 错误提示展示具体的 YAML 解析错误信息

### Requirement: 内置模板保存时创建自定义副本

系统 SHALL 在用户对内置模板点击"复制并保存"时，将当前 YAML 内容保存为新的自定义 workflow，原内置模板不变。

#### Scenario: 复制内置模板

- **WHEN** 用户查看内置模板并点击"复制并保存"
- **THEN** 系统以当前 YAML 内容创建一个新的自定义 workflow
- **AND** 新 workflow 出现在侧边栏自定义分组中
- **AND** 原内置模板保持不变
