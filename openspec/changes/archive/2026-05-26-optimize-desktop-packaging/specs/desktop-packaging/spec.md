## ADDED Requirements

### Requirement: 桌面生产包仅包含运行时必要内容

系统 SHALL 在 macOS、Windows、Linux 的 electron-builder 生产包中排除明确非运行时必要的文件，包括 source map、测试目录、示例目录、文档目录、临时构建元数据，以及生产运行不需要的 README / CHANGELOG 类文档。系统 MUST NOT 排除某个依赖的运行时入口文件、导出的 runtime 文件、native binary、schema 文件或运行时动态读取的资源文件。

#### Scenario: 全平台安全过滤规则存在

- **WHEN** 检查 `electron-builder.yml` 与相关打包前脚本
- **THEN** 存在作用于 macOS、Windows、Linux 的生产包过滤规则
- **AND** 过滤规则覆盖 source map、测试目录、示例目录、文档目录和临时构建元数据
- **AND** 过滤规则不限定为 Windows-only 配置

#### Scenario: 高风险源码过滤需要审计

- **WHEN** 实现准备排除 `node_modules/**/src/**` 或等价源码目录
- **THEN** 实现 MUST 先审计受影响依赖的 `package.json` `main`、`module`、`exports` 与运行时资源访问方式
- **AND** 对仍可能由运行时解析到源码目录的依赖 MUST 保留源码目录或加入明确 allowlist

### Requirement: Electron locale 保留列表显式声明

系统 SHALL 显式声明桌面包保留的 Electron locales，默认至少包含 `en-US` 与 `zh-CN`。系统 SHALL NOT 在没有产品语言支持需求的情况下保留 Electron 默认的全量 locale 集合。

#### Scenario: Electron locale 被精简

- **WHEN** electron-builder 生成任一平台解包产物
- **THEN** 解包产物的 Electron `locales` 目录仅包含配置中声明的 locale 文件
- **AND** `en-US.pak` 与 `zh-CN.pak` 存在

### Requirement: Bundled MCP server 分发契约保持不变

系统 SHALL 在打包瘦身后继续通过 `extraResources` 将 `out/mcp-servers` 分发到 app 的 asar 外部资源目录，使 `fyllo-specs` 与 `fyllo-cortex` 在生产环境可作为外部 Node 文件启动。系统 MUST NOT 因瘦身将 bundled MCP server bundle 放入 `app.asar` 内部或删除其生产启动所需文件。

#### Scenario: MCP server bundle 仍在 asar 外部

- **WHEN** electron-builder 生成任一平台生产包或解包产物
- **THEN** 产物中存在 asar 外部的 `mcp-servers/fyllo-specs/index.js`
- **AND** 产物中存在 asar 外部的 `mcp-servers/fyllo-cortex/index.js`
- **AND** 两个文件不位于 `app.asar` 内部

### Requirement: 打包体积基线与优化结果可对比

系统 SHALL 在本次优化中记录优化前后的打包体积数据，至少包含 Windows setup、Windows 解包目录、`app.asar`、`app.asar.unpacked`；对当前环境能构建的平台，SHALL 记录对应平台产物或解包目录大小。记录 MUST 足以判断内容瘦身是否生效。

#### Scenario: 体积数据被记录

- **WHEN** 完成本次打包优化
- **THEN** 任务记录或变更说明中包含优化前后的 Windows setup 大小
- **AND** 包含优化前后的 Windows 解包目录大小
- **AND** 包含优化前后的 `app.asar` 与 `app.asar.unpacked` 大小
- **AND** 对已验证的 macOS 或 Linux 产物包含对应大小数据

### Requirement: Windows NSIS 安装体验单独优化

系统 SHALL 将 NSIS 安装体验优化限定在 Windows 打包配置中。Windows NSIS 配置 MUST 基于瘦身后的实际对比数据选择压缩策略，并记录 `Please wait while setup is loading` 阶段耗时、安装阶段耗时和 setup 大小变化。

#### Scenario: NSIS 配置不影响非 Windows 平台

- **WHEN** 检查打包配置
- **THEN** NSIS 安装体验相关配置仅位于 Windows / NSIS 配置范围内
- **AND** macOS、Linux 目标配置不包含 NSIS 专项配置

#### Scenario: NSIS 优化有耗时对比

- **WHEN** 完成 Windows 安装器优化
- **THEN** 变更说明中记录优化前后的 `Please wait while setup is loading` 阶段耗时
- **AND** 记录优化前后的实际安装阶段耗时
- **AND** 记录最终选择压缩策略的 setup 大小 trade-off
