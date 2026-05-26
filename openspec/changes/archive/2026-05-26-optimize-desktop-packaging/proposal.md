## Why

当前桌面打包产物包含明显偏大的运行时内容：本地 Windows 产物中 setup 约 144M、`win-unpacked` 约 560M、`resources/app.asar` 约 225M，且 `app.asar` 内包含生产运行不一定需要的依赖源码、source map、文档、示例和测试文件。过大的全平台应用包会增加下载、安装、更新和磁盘占用成本；Windows NSIS 安装器还会在 `Please wait while setup is loading` 与实际安装阶段放大这些成本。

## What Changes

- 新增桌面打包产物契约，要求 macOS、Windows、Linux 生产包只包含运行时必要文件，并保留可审计的基线和优化后体积数据。
- 对 electron-builder 的通用打包规则进行瘦身设计，覆盖 `files`、生产 `node_modules`、Electron locales、`asar` / `asarUnpack` 与 `extraResources` 的边界。
- 保持 bundled MCP servers 的现有生产分发契约不变：`out/mcp-servers` 仍必须通过 `extraResources` 位于 asar 外部，且可被 Electron 作为 Node 进程启动。
- 对 Windows NSIS 安装体验做平台专项优化，目标是缩短安装器加载阶段和安装阶段耗时；压缩策略必须基于瘦身后的实测体积与耗时数据选择。
- 更新构建指南，记录全平台包内容瘦身规则、Windows NSIS 专项验证方法，以及新增/调整过滤规则时的安全验证要求。

## Capabilities

### New Capabilities

- `desktop-packaging`: 定义桌面生产包内容边界、跨平台体积验证、bundled MCP 分发约束，以及 Windows NSIS 安装体验要求。

### Modified Capabilities

- 无。

## Impact

- 影响 `electron-builder.yml` 的通用打包规则、平台规则、Electron language 保留策略和 Windows NSIS 配置。
- 可能影响 `scripts/electron-builder-before-pack.cjs`，用于补充 electron-builder 原生 `files` 规则难以表达的依赖过滤或打包前审计逻辑。
- 影响 `guidelines/Build.md`，需要新增全平台打包瘦身与 Windows NSIS 验证规范。
- 验证涉及 `pnpm build:unpack`、`pnpm build:win:x64`，以及按需运行 `pnpm build:mac:x64` / `pnpm build:mac:arm64` / `pnpm build:linux:x64`。
