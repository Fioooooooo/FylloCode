# OpenSpec 使用规范

本文档定义 FylloCode 项目中何时需要使用 OpenSpec，以及使用到什么程度。

## 目标

OpenSpec 用于管理功能需求、行为约束与变更边界，不用于替代普通代码实现细节讨论。

本项目对 OpenSpec 的使用分为两个层级：

1. **查阅现有 spec**
   只要改动涉及已有功能模块，就先阅读 `openspec/specs/<capability>/spec.md`。
2. **创建新的 change**
   只有当改动会新增、修改、删除需求约束或行为定义时，才需要在 `openspec/changes/` 下创建新 change。

## 默认规则

### 何时至少要查阅现有 spec

出现以下任一情况时，开始实现前必须先查阅对应 spec：

- 改动涉及已有页面、已有交互流程、已有状态流转
- 改动涉及 IPC channel、共享类型、preload API 或主渲染通信
- 改动涉及已存在 capability 的 bug 修复
- 无法仅凭代码确定“当前行为是否本来就应该如此”

如果找不到对应 spec，应先确认是否已有相近 capability，再决定是否需要新建 change。

### 何时必须创建新的 change

出现以下任一情况时，必须创建 OpenSpec change，再进入实现：

- 新增功能、页面、流程或 capability
- 修改用户可见行为、交互语义、默认值或空态/异常态表现
- 修改数据结构、存储格式、IPC 契约、共享类型、公共接口
- 修改跨模块协作方式或分层边界
- 进行显著重构，虽然目标是“等价重构”，但实际会影响外部行为、约束或集成方式
- 修复的 bug 暴露出当前 spec 缺失、错误或相互矛盾，需要补充或修正 requirement/scenario

### 何时通常不需要创建 change

以下改动通常可以直接实施，不必单独创建 change：

- 文案错字、注释修正、纯文档补充
- 不改变交互语义的样式微调
- 不改变行为的局部重构
- 纯内部实现替换，外部接口、输入输出与约束保持不变
- 测试补充、测试重构、mock 调整
- 日志、调试信息、类型标注、代码格式等工程性修正

前提是这些改动不会引入新的 requirement，也不会改变既有 SHALL 的含义。

## 边界判断

拿不准时，按下面顺序判断：

1. 这次改动是否会影响用户看到的行为、系统对外契约或模块职责边界？
2. 这次改动完成后，是否需要让后来者通过 spec 才能准确理解“系统现在应该怎么工作”？
3. 这次 bug 修复是否意味着现有 spec 不足以表达正确行为？

如果以上任一问题答案为“是”，就应该创建 change。

如果三个问题答案都是否，并且改动只停留在实现细节层，通常不需要创建 change。

## 本项目中的推荐阈值

FylloCode 对 OpenSpec 的使用应偏严格，原因如下：

- `openspec/specs/` 被定义为功能需求的权威来源
- spec 中的 `SHALL` 是强约束，不是参考建议
- 项目包含 Electron main、preload、frontend、shared types 多层协作，行为变更往往会跨层扩散

因此，本项目建议采用以下阈值：

- **功能定义变了**：用 OpenSpec
- **实现方式变了，但功能定义没变**：通常不用 OpenSpec
- **暂时无法判断**：先查相关 spec、代码、文档与已有 change；若求证后仍无法形成单一合理结论，或无法排除功能定义、系统约束或公共契约变化，应先与用户确认，再决定是否进入 OpenSpec 流程

## 常见场景示例

### 应该使用 OpenSpec

- 新增一个 Settings 子页，包含新的配置项与保存行为
- 调整 `project:*` IPC 返回结构，或新增错误码语义
- 将聊天页中的某个卡片交互从展开式改成分页式
- 修改首次打开应用时的路由与欢迎页呈现逻辑
- 给某个 integration 增加项目启用规则、连接状态规则或新的配置步骤

### 通常不需要 OpenSpec

- 修正某个按钮的间距、颜色或图标位置，但点击行为不变
- 将一段重复逻辑提取为工具函数，输入输出保持一致
- 为现有 store action 补单元测试
- 将 `console` 替换成统一 logger，但不改变用户可见行为或公共契约

## 建议工作流

### 仅查阅 spec 的情况

1. 找到对应 capability：`openspec/specs/<capability>/spec.md`
2. 阅读相关 `Requirements` 与 `Scenarios`
3. 按 spec 实现，并做与改动规模相称的验证

### 需要创建 change 的情况

1. 明确 change 名称与范围
2. 创建 `proposal.md`，说明为什么改、改什么、不改什么
3. 需要时补 `design.md`
4. 在 `specs/<capability>/spec.md` 中定义新增或变更的 requirement/scenario
5. 在 `tasks.md` 中拆解实施任务
6. 实现后执行校验并归档 change

## CLI 参考

常用命令：

```bash
openspec list
openspec spec list
openspec show <item-name>
openspec validate
openspec archive <change-name>
```

如果只是判断某次改动是否需要 OpenSpec，先回答下面一句即可：

> 这次改动是在改变“系统应该如何工作”，还是只是在改变“代码如何实现”？

前者使用 OpenSpec，后者通常不需要。
