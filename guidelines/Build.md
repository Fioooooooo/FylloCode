---
name: Build
description: FylloCode 的构建入口、打包产物、MCP server bundling 与生成物约束
keywords: [build, electron-vite, electron-builder, packaging, generated]
---

# Build

## Purpose

定义 FylloCode 的构建命令、Electron 打包链路、MCP server bundle 输出、生成物边界和不可手改的构建产物。任何涉及 `electron-vite`、`electron-builder`、`out/`、`dist/`、`resources/`、`build/` 或脚本化构建的工作，都必须先阅读本文档。

## Applicability

- 适用于 `package.json` 中的 build/dev/start 脚本。
- 适用于 `electron.vite.config.ts`、`electron-builder.yml`、`scripts/build-mcp-servers.mjs`。
- 适用于 `out/`、`dist/`、`resources/`、`build/`、`mcp-servers/` 的构建与打包边界。

## Sources of Truth

- `package.json`
- `electron.vite.config.ts`
- `electron-builder.yml`
- `scripts/build-mcp-servers.mjs`
- `scripts/electron-builder-before-pack.cjs`
- `build/**`
- `resources/**`
- `mcp-servers/**`
- `openspec/specs/bundled-mcp-servers/spec.md`

## Rules

- MUST: 使用 `electron-vite` 作为主进程、预加载脚本和渲染进程的统一构建入口；入口定义以 `electron.vite.config.ts` 为准。
- MUST: 在 `pnpm dev` 和 `pnpm build` 之前先执行 `build:mcp-servers`，确保内置 MCP server 已构建到 `out/mcp-servers/`。
- MUST: 让 `scripts/build-mcp-servers.mjs` 作为 bundled MCP server 的唯一打包脚本来源，不在其他脚本中手写重复 bundle 逻辑。
- MUST: 将 `out/` 与 `dist/` 视为生成物目录，不手动编辑、不提交人为修补结果。
- MUST: 让 `electron-builder.yml` 成为桌面打包行为的权威来源，包括 `files`、`asarUnpack`、`extraResources`、平台产物命名和 `beforePack` 钩子。
- MUST: 通过 `extraResources` 将 `out/mcp-servers` 打包到 `app.asar.unpacked/mcp-servers`，保持生产环境与开发环境对 bundled servers 的寻址契约一致。
- MUST: 保持 `fyllo-specs` 的 OpenSpec CLI 解析契约：`fyllo-specs` server bundle 位于 `app.asar.unpacked/mcp-servers/`，但 OpenSpec CLI 从 `app.asar/node_modules/@fission-ai/openspec/bin/openspec.js` 解析，使 CLI 入口与 `commander`、`fast-glob`、`yaml`、`zod` 等依赖仍在同一个 packaged `node_modules` 树中。
- MUST: 不得为了瘦身把 `@fission-ai/openspec/bin/openspec.js` 单独移动到 `app.asar.unpacked`。如果以后要把 OpenSpec CLI 放到 unpacked，必须同时移动完整依赖树并更新 bundled MCP 规范与测试。
- MUST: 将应用资源放在 `resources/`，将打包图标、entitlements 等构建素材放在 `build/`，避免把运行时数据混入构建素材目录。
- MUST: 桌面生产包瘦身规则必须配置在 `electron-builder.yml` 的通用打包范围内，覆盖 macOS、Windows、Linux；优先使用白名单包含 `out/**`、`resources/**` 与 `package.json`，再用排除规则兜底过滤源码目录、工程元数据、source map、测试、示例、benchmark、`docs/` 文档目录和临时元数据。
- MUST: `electron-builder.yml` 必须显式声明 `electronLanguages`，默认至少保留 `en-US` 与 `zh-CN`；新增正式支持语言时同步扩展该列表。
- SHOULD: 在修改构建脚本、打包资源或 alias 配置后，至少执行一次 `pnpm build` 验证主/预加载/渲染三端都能完成构建。
- SHOULD: 新增包内容过滤时先做依赖入口审计。尤其不要直接排除 `node_modules/**/src/**`，除非已确认受影响依赖的 `package.json` `main`、`module`、`exports` 和运行时资源访问都不会解析到源码目录。
- SHOULD: 保持 `electron-builder.yml` 与 `electron.vite.config.ts` 的入口和输出职责一致，避免一个文件新增入口而另一个文件没有对应打包规则。
- MAY: 为特定平台增加单独的 build 脚本，但必须通过 `package.json` 与 `electron-builder.yml` 显式声明。

## Examples

- Good: `pnpm dev` 先运行 `npm run build:mcp-servers`，再执行 `electron-vite dev`。
- Good: `scripts/build-mcp-servers.mjs` 使用 esbuild 为 `mcp-servers/fyllo-specs` 与 `mcp-servers/fyllo-skills` 生成 `out/mcp-servers/<name>/index.js`。
- Good: `electron-builder.yml` 通过 `extraResources` 将构建好的 MCP servers 带入产物。
- Good: `electron-builder.yml` 在顶层 `files` 中只包含 `out/**`、`resources/**` 与 `package.json`，并排除源码目录、`.github` / `.vscode` / `.cursor` / `.claude` 等工程元数据、`.map`、测试目录、示例目录、benchmark、`docs/` 文档目录和临时构建元数据，使规则对 macOS、Windows、Linux 同时生效。
- Good: Windows NSIS 安装体验配置放在 `win` / `nsis` 范围内，并用 setup 大小、`Please wait while setup is loading` 耗时、实际安装耗时做取舍。
- Bad: 手动修改 `out/mcp-servers/**/index.js` 修补运行时问题。
- Bad: 在业务代码里假设生产环境直接从仓库源文件运行 `mcp-servers/**/src/index.ts`。
- Bad: 把 `@fission-ai/openspec/bin/openspec.js` 单独移到 `app.asar.unpacked`，但让 `commander` 等依赖继续留在 `app.asar/node_modules`。
- Bad: 未审计依赖入口就全局排除 `node_modules/**/src/**`。

## Verification

- `pnpm build`
- `pnpm build:mcp-servers`
- 如修改打包配置：`pnpm build:unpack`
- 如修改平台相关配置：运行对应平台脚本，如 `pnpm build:mac`、`pnpm build:win`、`pnpm build:linux`
- 手动检查 `out/mcp-servers/`、`dist/` 与打包资源路径是否符合文档描述。
- 修改包内容过滤后，检查解包产物中 `app.asar.unpacked/mcp-servers/fyllo-specs/index.js` 与 `app.asar.unpacked/mcp-servers/fyllo-skills/index.js` 均存在。
- 修改 Electron locale 后，检查解包产物的 `locales` 目录只保留配置中的 locale 文件，并至少包含 `en-US` 与 `zh-CN`。
- 修改 Windows NSIS 压缩策略后，在 Windows 机器记录 setup 大小、`Please wait while setup is loading` 阶段耗时和实际安装阶段耗时；无法在当前机器验证时，必须在变更说明中列出待补测命令与缺口。

## Maintenance

- 当构建入口、打包工具、MCP server bundle 方式、资源目录或生成物约定变化时，必须更新本文档。
- 当引入新的内置 MCP server、平台脚本或打包钩子时，必须补充 Sources of Truth、Rules 和 Examples。
- 若构建脚本与 `package.json` 命令不一致，以实际脚本为准并立即修正文档。
