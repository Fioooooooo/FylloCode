## 1. 基线与依赖审计

- [x] 1.1 在当前主线构建结果中记录基线体积：`dist/FylloCode-0.10.2-win-x64-setup.exe`、`dist/win-unpacked`、`dist/win-unpacked/resources/app.asar`、`dist/win-unpacked/resources/app.asar.unpacked`；如果版本号变化，使用实际生成的 Windows setup 文件名。
  - Baseline from main workspace `dist`: setup `144M`, `win-unpacked` `560M`, `resources/app.asar` `225M`, `resources/app.asar.unpacked` `2.5M`.
- [x] 1.2 使用 `node_modules/.bin/asar list dist/win-unpacked/resources/app.asar` 或等价命令抽样确认 `app.asar` 中的可过滤内容类别，至少检查 `.map`、`test` / `tests` / `__tests__`、`example` / `examples`、`docs` / `doc`、README / CHANGELOG 类文件。
  - Sampled current `app.asar`; confirmed `.map`, `dist/*.test.js`, `dist/test/**`, `examples/**`, `docs/**`, `README.md`, and `CHANGELOG.md` are present in production dependencies. Kept singular `doc/**` after runtime validation showed `yaml/dist` requires `yaml/dist/doc/directives.js`.
  - Follow-up package audit found additional safe noise categories in packaged `node_modules`: `*.test.*` / `*.spec.*`, `benchmark(s)`, `playwright-tests`, `tests-examples`, `CODE_OF_CONDUCT`, `SECURITY`, and mixed-case README variants. Added excludes for these while preserving `LICENSE*` files.
- [x] 1.3 审计准备过滤的高风险目录，特别是 `node_modules/**/src/**`：检查受影响依赖的 `package.json` `main`、`module`、`exports`，并把不能安全排除的依赖记录为保留项。
  - Decision: do not exclude `node_modules/**/src/**` in this pass. The current `app.asar` contains source trees for packages such as `@ai-sdk/*`; entry audits are package-specific and broad removal is not safe.
  - `fyllo-specs` audit: the MCP server bundle is launched from `app.asar.unpacked/mcp-servers/fyllo-specs/index.js`, but OpenSpec CLI resolution intentionally uses `app.asar/node_modules/@fission-ai/openspec/bin/openspec.js`. `@fission-ai/openspec` runtime files are `bin`, `dist`, `schemas`, and `scripts/postinstall.js`, with dependencies such as `commander`, `fast-glob`, `yaml`, and `zod` resolved from the same packaged `node_modules` tree. Do not move only the CLI entry to `app.asar.unpacked`.

## 2. 全平台打包内容瘦身

- [x] 2.1 修改 `electron-builder.yml` 的通用 `files` 规则，添加作用于 macOS、Windows、Linux 的安全排除项：source map、测试目录、示例目录、文档目录、临时构建元数据、README / CHANGELOG 类非运行时文档；不得把这些规则放在 Windows-only 配置下。
  - Final structure uses a whitelist-style app payload: include `out/**`, `resources/**`, and `package.json`; add defensive excludes for source folders (`electron/**`, `frontend/**`, `mcp-servers/**`, `guidelines/**`, `openspec/**`, `scripts/**`, `build/**`), project metadata (`.claude`, `.github`, `.cursor`, `.vscode`, root build/dev config), and safe dependency noise.
- [x] 2.2 在 `electron-builder.yml` 中显式配置 Electron locale 保留列表，至少保留 `en-US` 与 `zh-CN`，并确保配置对所有桌面平台生效。
- [x] 2.3 保持 `asarUnpack` 与 `extraResources` 中 bundled MCP server 相关配置有效：`out/mcp-servers` 仍复制到 asar 外部，`node_modules/@fission-ai/openspec/**` 的 unpack 行为不得在未证明安全前删除。
  - Follow-up audit showed the runtime contract is the opposite: OpenSpec CLI should remain inside `app.asar` with its dependency tree, while only the MCP server bundle needs to be outside asar. Removed `node_modules/@fission-ai/openspec/**` from `asarUnpack`; kept `out/mcp-servers` in `extraResources`.
  - Verified packaged macOS `app.asar.unpacked` no longer contains `node_modules/@fission-ai/openspec`; `app.asar` contains the OpenSpec CLI and its dependencies. Using the packaged Electron binary with `ELECTRON_RUN_AS_NODE=1`, OpenSpec CLI calls from `app.asar` passed for `list --json`, `status --change optimize-desktop-packaging --json`, and `instructions tasks --change optimize-desktop-packaging --json`.
- [x] 2.4 如 electron-builder 的 glob 规则无法安全表达某些过滤或审计逻辑，扩展 `scripts/electron-builder-before-pack.cjs`，保留现有 `packager.getPackageManager = async () => "traversal"` 逻辑，并把新增逻辑限定为打包前审计或安全过滤辅助。
  - No hook extension needed. The safe filters are expressible in top-level `electron-builder.yml` `files`; existing traversal collector override remains unchanged.

## 3. Windows NSIS 安装体验

- [x] 3.1 在完成全平台瘦身后，使用 `pnpm build:win:x64` 生成 Windows setup，并记录 setup 大小、`win-unpacked` 大小、`app.asar` 大小和 `app.asar.unpacked` 大小。
  - Final `store` build output after safe dependency-noise excludes and OpenSpec unpack removal: setup `135M` by `du` (`119M` by `ls -lh`), `win-unpacked` `435M`, `resources/app.asar` `144M`, `resources/app.asar.unpacked` `1.4M`.
  - Baseline comparison: setup `144M -> 135M`, `win-unpacked` `560M -> 435M`, `app.asar` `225M -> 144M`, `app.asar.unpacked` `2.5M -> 1.4M`.
  - Verified Windows `app.asar.unpacked` no longer contains `node_modules/@fission-ai/openspec`; `app.asar` contains `/node_modules/@fission-ai/openspec/bin/openspec.js` plus `commander`, `fast-glob`, `yaml`, and `zod` runtime dependencies.
- [x] 3.2 对 Windows 压缩策略做至少一次对比构建：默认/普通压缩与偏安装速度的配置（例如 `win.compression: store` 或等价更快策略），记录 setup 大小变化。
  - Compared `win.compression: store` against `normal` after slimming. `store` setup was `118M` by `ls -lh`; `normal` setup was `117M` by `ls -lh`. The roughly `1M` installer size increase is acceptable for the install-speed-oriented strategy, pending Windows timing confirmation.
- [ ] 3.3 在 Windows 环境安装对比产物，记录 `Please wait while setup is loading` 阶段耗时和实际安装阶段耗时；根据数据选择最终 NSIS / Windows 压缩配置。
  - Not completed in this macOS environment. Final config selects `win.compression: store` based on size trade-off; Windows machine still needs timing for `Please wait while setup is loading` and actual install phase using the final setup.
- [x] 3.4 确认 NSIS 专项配置只影响 Windows：macOS、Linux 配置不得包含 NSIS 专项字段。
  - `compression: store` is set under `win`; `nsis` remains the Windows installer target block. macOS and Linux target blocks do not contain NSIS-only fields. Added `oneClick: false` because `allowToChangeInstallationDirectory: true` requires an assisted NSIS installer in electron-builder 26.

## 4. 验证与文档

- [x] 4.1 运行 `pnpm build:unpack`，确认当前平台解包产物可生成，并检查 asar 外部存在 `mcp-servers/fyllo-specs/index.js` 与 `mcp-servers/fyllo-cortex/index.js`。
  - `pnpm build:unpack` passed on macOS x64 after the final `files` rule update. Verified `app.asar.unpacked/mcp-servers/fyllo-specs/index.js` and `app.asar.unpacked/mcp-servers/fyllo-cortex/index.js` exist. Verified `app.asar` still contains `/node_modules/@fission-ai/openspec/bin/openspec.js`, `yaml/dist/doc/directives.js`, and core app files under `out/**`.
  - Verified `app.asar` does not include excluded project source folders, `.claude` / `.github` / `.cursor` / `.vscode` metadata, `electron-builder.yml`, test/spec files, benchmark folders, or security/code-of-conduct markdown from the sampled exclusion patterns.
- [ ] 4.2 运行 `pnpm build:win:x64`，确认 Windows setup、blockmap、`latest.yml` 与 `win-unpacked` 正常生成；如当前环境不能完整验证 Windows 安装耗时，在任务结果中明确记录未验证原因和需在 Windows 机器补测的命令。
  - `pnpm package:win:x64` completed after rerunning outside the sandbox for wine/rcedit. Generated Windows setup, `.blockmap`, and `win-unpacked`.
  - `latest.yml` was not generated in this worktree build, while the previous main-workspace `dist` contains it. No explicit `publish` configuration is present in `electron-builder.yml`; auto-update metadata generation needs a follow-up check before this task can be considered fully complete.
  - Windows install timing is not verified on macOS. Run on a Windows machine: `pnpm build:win:x64`, then time the generated setup's `Please wait while setup is loading` phase and actual install phase.
- [x] 4.3 按可用环境运行 `pnpm build:mac:x64`、`pnpm build:mac:arm64`、`pnpm build:linux:x64` 中至少一个非 Windows 平台构建，确认全平台过滤不会破坏非 Windows 产物；无法运行的平台需记录原因。
  - `pnpm build:mac:x64` completed. Produced `dist/FylloCode-0.10.2-mac-x64.dmg` `144M`, `dist/FylloCode-0.10.2-mac-x64.zip` `145M`, `dist/mac` `367M`, mac `app.asar` `144M`, and mac `app.asar.unpacked` `2.5M` before the OpenSpec unpack removal.
  - `pnpm build:unpack` after OpenSpec unpack removal produced mac `app.asar` `145M` and mac `app.asar.unpacked` `1.4M`; packaged OpenSpec CLI execution from `app.asar` passed using the built Electron binary. macOS signing was skipped because no valid Developer ID identity is available locally.
- [x] 4.4 更新 `guidelines/Build.md`，新增全平台生产包瘦身规则、Electron locale 保留规则、bundled MCP server 不可被瘦身破坏的约束，以及 Windows NSIS 安装体验验证方法。
- [ ] 4.5 在最终变更说明中汇总优化前后体积与 Windows 安装耗时数据，至少包含 Windows setup、`win-unpacked`、`app.asar`、`app.asar.unpacked` 和最终 NSIS 压缩策略 trade-off。
  - Size data is recorded above. Final NSIS strategy is `win.compression: store` with assisted installer mode (`oneClick: false`) because `allowToChangeInstallationDirectory` is enabled. `store` increased the setup by roughly `1M` versus `normal` in prior comparison in exchange for an install-speed-oriented package. Windows install timing remains pending because this session ran on macOS.
