## Context

当前 `electron-builder.yml` 只显式包含 `out/**` 与 `resources/**`，但 electron-builder 仍会自动加入 `package.json` 与生产 `node_modules`。本地检查显示 Windows setup 约 144M，解包后的 `win-unpacked` 约 560M，其中 `FylloCode.exe` 约 208M、`resources/app.asar` 约 225M、`app.asar.unpacked` 约 2.5M。`app.asar.unpacked` 不大，慢安装的主要压力来自需要释放的大体积 Electron runtime、`app.asar` 与应用 exe。

`scripts/electron-builder-before-pack.cjs` 当前强制 electron-builder 使用 traversal collector，以规避 electron-builder 26.8.1 的 pnpm collector 会漏掉 `ai` 等包运行时子依赖的问题。因此本次不能简单回退到 pnpm collector 或粗暴删除生产依赖，必须在保持运行时依赖完整的前提下瘦身。

## Goals / Non-Goals

**Goals:**

- 全平台减少桌面生产包中的非运行时必要内容，覆盖 macOS、Windows、Linux。
- 保持 bundled MCP servers、OpenSpec CLI 路径、Electron 启动和主渲染流程正常工作。
- 为 Windows NSIS 安装器选择更适合安装体验的配置，并用实际 setup 大小、解包大小和安装耗时验证。
- 把新增打包约束写入 `guidelines/Build.md`，后续新增依赖或打包资源时有明确边界。

**Non-Goals:**

- 不改应用功能、IPC channel、存储格式或用户界面行为。
- 不更换 Electron、electron-builder、NSIS 或包管理器。
- 不引入在线安装器；本次仍以现有离线安装包为主。
- 不为了瘦身移除当前运行时需要的 bundled MCP servers、OpenSpec 支持或核心编辑/渲染能力。

## Decisions

### 1. 将包内容瘦身作为全平台契约

打包内容瘦身放在通用 `desktop-packaging` 能力下，而不是 Windows-only 能力。`files`、`asar`、生产 `node_modules`、Electron locales 和 `extraResources` 都是 electron-builder 的跨平台打包边界，macOS、Windows、Linux 都应受同一套“只包含运行时必要文件”的约束。

备选方案是只处理 Windows 安装慢问题。该方案能缓解 NSIS 安装，但会留下 macOS/Linux 包体膨胀和后续更新成本问题，因此不采用。

### 2. 先做保守过滤，再审计高风险过滤项

第一批过滤应只包含运行时几乎不依赖的内容：source map、测试目录、示例目录、文档目录、README/CHANGELOG 类文档、临时构建元数据。对 `node_modules/**/src/**` 这类高风险过滤项必须先审计依赖包的 `package.json` `main` / `module` / `exports`，确认运行时不会解析到源码目录；无法确认时不排除。

备选方案是直接大范围排除 `src/**`。该方案瘦身效果可能更明显，但容易破坏发布为源码包或通过 exports 指向源码的依赖，因此不作为第一步。

### 3. Electron locales 使用显式保留列表

Electron 默认保留全部 locale。FylloCode 当前主要面向中文与英文使用场景，本次应通过 electron-builder 的 `electronLanguages` 保留 `en-US` 与 `zh-CN`，减少所有平台 Electron runtime 体积。若后续新增正式支持语言，需要同步扩展该列表。

备选方案是保留全部 locale。该方案风险最低，但每个平台都继续携带大量当前不需要的 `.pak` 文件，不符合本次瘦身目标。

### 4. Windows NSIS 压缩策略在瘦身后用数据选择

NSIS 慢包含两个阶段：setup 启动加载压缩数据，以及安装时释放文件。应先完成全平台瘦身，再对 Windows 构建比较至少两个配置：默认/普通压缩与更偏安装速度的配置（例如 `win.compression: store` 或等价更快策略）。最终配置必须记录 trade-off：安装包大小变化、`Please wait while setup is loading` 耗时、安装阶段耗时。

备选方案是立即关闭压缩。该方案可能最快，但会显著增加下载体积；在瘦身前直接采用会掩盖真正的包内容问题。

### 5. 保持 bundled MCP servers 的 asar 外部路径不变

`out/mcp-servers` 必须继续通过 `extraResources` 进入 `app.asar.unpacked/mcp-servers`。不能因为瘦身把 MCP server bundle 放回 `app.asar`，也不能删除 `node_modules/@fission-ai/openspec/**` 的 unpack 规则，除非 Apply 阶段证明生产环境 OpenSpec CLI 路径不再需要该 unpack 形态并同步更新相关 spec。

备选方案是将所有内容都放入 `app.asar`。该方案可能减少散文件，但会破坏当前 bundled MCP server 作为外部 Node 文件 spawn 的契约。

## Risks / Trade-offs

- [过滤过度导致运行时依赖缺文件] → 先加入保守过滤，随后运行 `pnpm build:unpack` 并启动解包产物；高风险过滤必须有依赖入口审计记录。
- [Windows 安装速度提升但 setup 变大] → 用瘦身前后和压缩策略对比数据决策；如果 setup 增长不可接受，回退到普通压缩并保留内容瘦身。
- [Electron locale 精简影响非中英文系统显示] → 保留 `en-US` 兜底；新增正式语言支持时更新 `electronLanguages`。
- [只在当前开发机验证不足] → 至少完成当前平台 `build:unpack`，Windows 产物必须通过 Windows 环境安装耗时验证；无法在当前机器验证的平台要在 tasks 中明确记录未验证项。

## Migration Plan

1. 记录当前 `dist` 基线：setup/平台产物大小、解包目录大小、`app.asar` 大小、`app.asar.unpacked` 大小。
2. 添加全平台安全过滤与 Electron locale 保留配置。
3. 构建解包产物并检查 app package 中是否仍包含 bundled MCP servers 与必要 runtime 依赖。
4. 对 Windows NSIS 压缩策略做对比构建，记录大小和安装耗时后选择最终配置。
5. 更新 `guidelines/Build.md`，把新过滤规则、locale 规则和 NSIS 验证方式固化。

Rollback 策略：如果瘦身导致运行时失败，先回退最近新增的高风险过滤项；如果 NSIS 压缩策略导致 setup 体积不可接受，保留内容瘦身但回退 Windows 压缩策略。

## Open Questions

无。当前范围已收敛为“全平台打包内容瘦身 + Windows NSIS 安装体验专项优化”。
