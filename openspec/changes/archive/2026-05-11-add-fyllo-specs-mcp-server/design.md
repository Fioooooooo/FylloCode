## Context

FylloCode 的 chat 能力基于 ACP 协议：主进程通过 `services/chat/acp-session.ts` 调用 `ClientSideConnection.newSession({ cwd, mcpServers: [] })` 创建 ACP session，目前 `mcpServers` 始终为空。为了让 ACP agent（例如 `claude-acp`）能够使用 OpenSpec 风格的工作流，同时避免依赖用户机器上预装的 `openspec` CLI，需要一个随应用分发的 stdio MCP server——`fyllo-specs`。

本项目已对主进程分层（`MainProcess.md` 五层架构）、资源路径解析（`Architecture.md#数据目录` + `infra/paths#getResourcesPath()`）、ACP 进程池（`infra/process/acp-process-pool.ts`）作出明确约束。新增的内置 MCP server 必须与这些既有约束兼容：不得在 `services/ipc` 层拼 `process.resourcesPath`，不得绕过 `getResourcesPath()`，不得引入与现有打包布局冲突的路径假设。

`@fission-ai/openspec@1.3.1` 对外的公共 surface 是 CLI（`bin/openspec.js`）；其运行时逻辑（`dist/core/*`、`dist/commands/*`）未登记于 `package.json#exports`，也未在 `dist/core/index` 中 re-export 给外部使用。因此本次设计**以 CLI 作为消费接口**，通过 spawn `bin/openspec.js` 并解析 `--json` stdout 获取状态；除 CLI 以外的文件系统动作（`openspec new change` 之外的目录创建、`archive` 的 `mv`）由 MCP server 自行完成。

## Goals / Non-Goals

**Goals:**

- 内置 MCP server 以独立构建目标形式存在，不与 Electron 主进程同进程，目录位于项目顶层 `mcp-servers/fyllo-specs/`，和 `electron/`、`frontend/` 平级。
- 注册四个 tool：`explore`、`create-proposal`、`apply-change`、`archive-change`，分别对应 `openspec-explore`、`fyllo-propose`、`fyllo-apply-change`、`fyllo-archive-change` 四个 skill 的语义。
- 四个 tool 的 prompt 正文以独立 `.md` 文件维护在 `src/prompts/` 下；tool 代码只负责"加载 prompt + 计算工作区 state + 合并返回"。
- 不依赖**系统 PATH** 上的 OpenSpec CLI；随应用分发 `@fission-ai/openspec` 作为依赖，在 MCP server 内部 spawn 其 `bin/openspec.js`；不依赖用户系统 Node；不依赖用户 PATH。
- ACP session 每次 `newSession` 都注入 `fyllo-specs` 的启动描述符，由 ACP agent 自行 spawn 并管理其生命周期。
- 构建产物 single-file，集成到 electron-builder 的 `extraResources`，走 asarUnpack 保证可执行。

**Non-Goals:**

- 不实现 `fyllo-cortex` MCP server（另一个 change）。
- 不处理"用户自定义 MCP"与内置 MCP 的合并（归 `integration-custom-mcp`，留空位）。
- 不为内置 MCP 提供 UI（首版默认全开，无 toggle）。
- 不保证兼容非 `claude-acp` 的 ACP agent 的 MCP 行为差异。
- 不改变 OpenSpec 规范本身；只"复用其能力"。

## Decisions

### D1：MCP server 作为顶级构建目标 `mcp-servers/`，不归入 `electron/main/`

**决定**：目录 `mcp-servers/fyllo-specs/` 与 `electron/`、`frontend/` 平级。

**理由**：`MainProcess.md` 明确五层架构都运行在 Electron 主进程同一进程内；MCP server 是由 ACP agent spawn 的独立 Node 子进程，不是主进程一部分，不应与其代码混放。顶级目录与 `frontend/` 惯例一致。

**替代方案**：放 `electron/main/mcp-servers/` —— 驳回，因为依赖方向和进程边界都不匹配。

### D2：以 CLI 作为消费接口（方案 A），版本锁 `~1.3.0`

**决定**：把 `@fission-ai/openspec@~1.3.1` 作为生产依赖加入根 `package.json`；MCP server 在每个 tool 调用中按需 spawn 其 `bin/openspec.js`（以 Node 运行，见 D6），通过解析 `--json` stdout 获取 `list` / `status` / `instructions` 等状态。

**理由**：

- 上游 `package.json#exports` 仅开放根入口 `"."`；`dist/core/index` 只 re-export 了 `global-config` 相关的 8 个函数，`list` / `archive` / `artifact-graph` / `templates` 等都在内部实现中，未对外开放。`dist/cli/index.d.ts` 为空，业务逻辑住在 `dist/commands/*`，直接引入会拽进 commander / inquirer / ora / chalk。强行绕 exports 或 patch-package 都是踩在**未声明内部 API**上。
- CLI（`bin/openspec.js`）是 openspec 真正承诺的公共接口；`--json` 输出的字段在不同 version 之间比内部函数签名稳定得多。
- 保持"开箱即用"——CLI 作为 dep 随应用分发，spawn 时用 Electron 二进制 + `ELECTRON_RUN_AS_NODE` 或 bundled runtime 运行，不需要用户装全局 openspec 或系统 Node。
- 保持"吸取规范"——`list` / `status` / `instructions` / `archive` 等动作仍由 openspec 自身执行，与 fyllo-propose 等现有 skill 行为一致。
- 锁 `~1.3.0`：CLI 本身也可能有 JSON schema 调整，小版本升级前过适配层冒烟测试。

**替代方案 C（作为库 import core）**：驳回——`dist/core/` 未在 exports 声明，Node 会拒绝访问，强绕即踩内部 API。
**替代方案 C+patch-package（改 exports）**：驳回——每次升级都要 review patch；且 posthog / commander 等需要额外处理，净收益小于方案 A。
**替代方案 B（完全自研替代）**：驳回——要重写 spec-delta / artifact-graph 语义，背离"吸取规范"。

**启动前需要验证的点**（见 tasks.md §1）：

- `bin/openspec.js` 能否在 `ELECTRON_RUN_AS_NODE=1` 下通过 Electron 二进制稳定启动，cwd 语义是否正确。
- `openspec` 是否可通过 env 关闭遥测（上游 README 明确列出支持 `OPENSPEC_TELEMETRY=0` 与 `DO_NOT_TRACK=1` 两个环境变量）；若在 §1 抓包验证仍见外发，则 patch/monkey-patch。
- esbuild bundle `@fission-ai/openspec` 的产物体积，是否需要改为 external + 随 node_modules 分发。

### D3：薄适配层 `src/openspec-runtime/`，封装 CLI spawn 与 JSON 解析

**决定**：新增目录 `src/openspec-runtime/`，内部统一通过 `spawner.ts` 调用打包后的 `openspec` CLI，并提供 5 个纯函数给 tool 层：

| 适配函数                                               | 语义                                                                                     | 实现方式                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `listChanges(projectRoot)`                             | 列出 `openspec/changes/*` 的活跃 change（排除 `archive/`）                               | `spawn openspec list --json`，解析 stdout                                                                                 |
| `computeStatus(projectRoot, changeName)`               | 返回 artifact graph、applyRequires、每个 artifact 的 status/outputPath                   | `spawn openspec status --change <name> --json`                                                                            |
| `getInstructions(projectRoot, changeName, artifactId)` | 返回 `{ template, outputPath, dependencies, instruction }`                               | `spawn openspec instructions <artifactId> --change <name> --json`                                                         |
| `createChange(projectRoot, name)`                      | 创建 `openspec/changes/<name>/` 并写初始 `.openspec.yaml`                                | `spawn openspec new change "<name>"`；成功后补写 `status: creating` 到 yaml                                               |
| `archiveChange(projectRoot, name, { confirm })`        | 预览或执行归档：`openspec/changes/<name>` → `openspec/changes/archive/YYYY-MM-DD-<name>` | 预览用 `list --json` + 自算 target；执行用 fs.rename（跨平台统一行为，不依赖 `openspec archive` 子命令避免 prompts 交互） |

**spawner 契约**（`src/openspec-runtime/spawner.ts`）：

- 固定传 `env: { ...process.env, OPENSPEC_TELEMETRY: "0", DO_NOT_TRACK: "1", NO_COLOR: "1" }`。`OPENSPEC_TELEMETRY=0` 与 `DO_NOT_TRACK=1` 是 openspec README 列出的两种关闭遥测方式，并用以获得双保险；`NO_COLOR=1` 仅用于避免 ANSI 颜色码污染 stdout JSON。
- 固定传 `cwd: projectRoot`。
- 超时 30s；超时 kill 子进程并抛 `OpenspecTimeoutError`。
- stderr 合并到 logger.warn（不进 tool response），stdout 按 JSON 解析。
- 返回非 0 或 stdout 非法 JSON 时抛 `OpenspecCliError`，携带原始 stderr 前 400 字符供排错。

**理由**：tool 代码只认适配层；未来 openspec CLI 输出 schema 调整只改 `openspec-runtime/`；测试用 `fixtures/openspec-sample/` + 真正 spawn 做集成测试，而不是 mock CLI。

**边界**：适配层不读 prompt，不做 agent 流程编排；这些属于 tool 层。适配层只做"spawn CLI + JSON parse + 错误归一化"。

### D4：prompt 以独立 md 文件维护，build 时内联

**决定**：四个 tool 对应 `src/prompts/{explore,create-proposal,apply-change,archive-change}.md`。tool 代码通过一个统一的 `loadPrompt(id)` 访问：

- **dev**：`fs.readFileSync(path.join(__dirname, "../prompts/<id>.md"), "utf8")`（MCP server 每次 ACP newSession 都 spawn 新进程，无缓存问题）。
- **build**：esbuild 配置 `loader: { ".md": "text" }`，md 内容内联进 `index.js`。prompt 即字符串 literal，产物仍是单文件 JS，不引入外部资源依赖。

**理由**：满足"开发、调试时改 md 即改文案"；同时 build 产物保持单文件部署，不用为每个 md 额外做 asarUnpack / 路径解析。

**拒绝替代**：把 md 作为资源文件和 JS 并列分发——每次都要走 `getResourcesPath()`，增加一层复杂度，无收益。

### D5：tool 返回结构：`skill_prompt` + `state` 双段文本

**决定**：每个 tool 的 response 为 `content: [{ type: "text", text: "<skill_prompt>...</skill_prompt>\n\n<state>...</state>" }]`。

- `<skill_prompt>`：对应 md 的内容，告诉 agent"怎么干"。
- `<state>`：JSON 序列化的当前工作区状态（active changes、artifact status、applyRequires、templates、outputPath 等），告诉 agent"现在是什么情况"。

**理由**：一次 tool 调用返回 agent 立即行动所需的所有信息，避免往返查询；同时 state 是纯数据，agent 可直接解析，不必二次调用。

**约束**：prompt md 内不得引用 `openspec` CLI 命令（例如 `openspec list --json`）；这些已被 tool 内部的 state 替代，文本需要重写。

### D6：ACP 注入位置 `acp-session.ts`，由 `bundled-mcp-servers.ts` 产出 spec

**决定**：新增 `electron/main/infra/mcp/bundled-mcp-servers.ts`，导出 `getBundledMcpServers({ projectPath }): McpServerSpec[]`。`acp-session.ts` 在 `newSession`、`resumeSession` **两个入口**都要注入：

```ts
const mcpServers = getBundledMcpServers({ projectPath: this.opts.projectPath });

if (acpSessionId) {
  try {
    await connection.resumeSession({ sessionId: acpSessionId, cwd, mcpServers });
  } catch {
    // fallback 到 newSession，同样传 mcpServers
  }
}

if (!acpSessionId) {
  const res = await connection.newSession({ cwd, mcpServers });
  acpSessionId = res.sessionId;
}
```

ACP SDK v0.20.0 schema：`NewSessionRequest.mcpServers` 是 required，`ResumeSessionRequest.mcpServers` 是 optional。但一旦 resume 时不传，恢复后的 session 上下文就不挂载 MCP server，原本在 newSession 期间可用的 `fyllo-specs` tool 会在 agent 侧"消失"。为了保证 agent 感知到的 tool 集合在 new/resume 之间保持一致，**resumeSession 也必须显式传**。

**环境变量契约**：

| 变量                   | 值                       | 作用                                                              |
| ---------------------- | ------------------------ | ----------------------------------------------------------------- |
| `ELECTRON_RUN_AS_NODE` | `"1"`                    | 让 electron binary 当 node 运行，不起 Chromium                    |
| `FYLLO_PROJECT_PATH`   | 当前项目的 `projectPath` | MCP server 定位 `openspec/` 根目录（cwd 不可靠，可能被 agent 改） |
| `FYLLO_MCP_TELEMETRY`  | `"0"`                    | 保险起见强制关 openspec posthog                                   |

**启动命令**：`command: process.execPath`，`args: [resolveBundle("fyllo-specs")]`。`resolveBundle` 在 dev 取 `out/mcp-servers/fyllo-specs/index.js`，prod 取 `getResourcesPath() + '/mcp-servers/fyllo-specs/index.js'`。

### D7：构建接入 electron-vite + electron-builder

**决定**：

- `electron.vite.config.ts` 增加 `mcpServers` 段（或复用 `main.build.rollupOptions`）以新入口 `mcp-servers/fyllo-specs/src/index.ts` 输出到 `out/mcp-servers/fyllo-specs/index.js`；`format: cjs`，target 与主进程一致。`@modelcontextprotocol/sdk` 默认 inline。
- **`@fission-ai/openspec` 声明为 external**：该包含有 ora/inquirer 等 side-effectful 模块，不适合 inline 进 MCP server bundle；MCP server 只通过子进程 spawn CLI，不 require 包的 JS 入口。因此 MCP server 代码里不得 `import`/`require` `@fission-ai/openspec`。
- openspec 本体通过两种方式随应用分发（择一，在 §1 验证决定）：
  1. **直接引用 node_modules**：`electron-builder.yml` 的 `files` 或 `extraResources` 里把 `node_modules/@fission-ai/openspec/` 显式白名单纳入打包产物；`bundled-mcp-servers.ts` 计算 CLI 入口路径时按 dev/prod 分支到 repo `node_modules/...` 或 app `Resources/app/node_modules/...`。
  2. **独立 bundle CLI**：用 esbuild 把 `node_modules/@fission-ai/openspec/bin/openspec.js` 打成 `out/vendor/openspec-cli/index.js` 单文件 + 依赖；体积代价约 1–2MB。

  默认走方案 1，保持依赖管理走 pnpm；若体积或 node_modules 打包可靠性出问题再切方案 2。

- `electron-builder.yml` 增加：
  ```yaml
  extraResources:
    - from: out/mcp-servers
      to: mcp-servers
  ```
  `asarUnpack` 不需要显式列出——`extraResources` 本身就放在 asar 之外。如果 CLI 走方案 1，额外补 `asarUnpack: ["node_modules/@fission-ai/openspec/**", "node_modules/.pnpm/@fission-ai+openspec*/**"]`（具体路径在 §1 验证时 finalize）。
- `pnpm build` 流程中新增 MCP server 构建步骤（`electron-vite build` 自动处理；若不能 in-one-pass，fallback 为独立 esbuild 脚本）。
- **源目录 `resources/` 不承载 MCP 产物**：`resources/` 是 git-tracked 的"随应用分发的源资源"目录（目前放 icons、workflows 模板），不得把 MCP server 产物复制进去。dev 阶段 `bundled-mcp-servers.ts` 通过 `is.dev` 分支直接从项目根的 `out/mcp-servers/<name>/index.js` 读取；prod 阶段由 `electron-builder` 的 `extraResources` 把 `out/mcp-servers/` 复制到打包后 app 的 `Contents/Resources/mcp-servers/`（macOS）——生产环境再走 `getResourcesPath()` 统一解析。两侧路径的不对称由 `bundled-mcp-servers.ts` 内部吸收，调用方感知不到。

### D8：prompt 重写，解除 CLI 依赖

**决定**：`src/prompts/*.md` 基于四个现有 skill 改写，原 skill 中 **agent 直接执行** 的 `openspec ...` CLI 命令替换为"tool 已为你完成 / state 里已有 / 调用本 tool 并传特定参数"。典型替换：

- 原 `openspec list --json`（agent 执行） → 由 tool 内部调 CLI，结果塞进 state
- 原 `openspec status --change X --json` → 同上
- 原 `openspec instructions X --change Y --json` → 由 tool 预取并塞进 state 的 `currentArtifact` 字段
- 原 `openspec new change` → tool 代理执行（内部调 `openspec new change`），prompt 文本说"tool 已创建目录，请继续 artifact 生成"

**注意区分两条边界**：

1. openspec CLI 由 **MCP server 内部** spawn，不暴露给 agent；agent 视角下 CLI 不存在。
2. `Read` / `Write` / `Edit` 等文件编辑操作仍然由 **agent** 使用自身工具完成——如 `tasks.md` 写作、`spec.md` 写作、checkbox 勾选。

`mkdir -p openspec/changes/archive` 与 `mv openspec/changes/<name> ...` 的归档动作由 tool 代执行（见 D3 `archiveChange`，用 fs.rename 实现跨平台一致）。

### D9：错误归一化

**决定**：MCP tool 抛错时统一以 `McpError`（`@modelcontextprotocol/sdk` 提供）返回，`code` 映射：

| 场景                               | MCP code                            |
| ---------------------------------- | ----------------------------------- |
| 入参校验失败                       | `InvalidParams`                     |
| 找不到 change / artifact / project | `InvalidRequest`                    |
| openspec-runtime 内部异常          | `InternalError`（附 cause message） |
| 文件系统写入失败                   | `InternalError`                     |

不自定义 code 字符串；MCP 客户端能识别的 code 才是"跨进程契约"的一部分。

## Risks / Trade-offs

- **R1：openspec CLI `--json` 输出 schema 升级可能变动**
  → Mitigation：锁 `~1.3.0`；适配层是唯一 JSON 解析点；CI 加 smoke 测试（调用 5 个适配函数的冒烟用例，升级前自动跑）。
- **R2：posthog telemetry 关不掉**
  → Mitigation：spawner 统一传 openspec README 文档化的 `OPENSPEC_TELEMETRY=0` 与 `DO_NOT_TRACK=1`。§1 验证阶段抓包确认无外发；若仍有，用 `patch-package` 替换 posthog-node 为 no-op。
- **R3：ACP agent 对 stdio MCP server 的协议差异（例如 resume 是否需要重新 register）**
  → Mitigation：tasks §9 加端到端冒烟（以 `claude-acp` 为基准），`resumeSession` 场景独立验证。
- **R4：Electron as node 执行 `process.execPath` 在 prod macOS 上权限 / Gatekeeper 问题**
  → Mitigation：沿用已有 `acp-process-pool` 的 spawn 惯例；如 Gatekeeper 拦截则用 `app.getAppPath() + node_modules/.bin/node`（打包进 extraResources）作为 fallback。
- **R5：子进程链路加深 + 冷启动开销**
  → 现实：每个 tool call 多一次 spawn openspec CLI（约 100–300ms）。MCP server 自身进程生命周期仍由 ACP agent 管理，不额外增加。Tool call 本身的网络往返（LLM → ACP → MCP）通常在秒级，CLI 这一跳相对可接受。如果热点 tool（如 `apply-change`）连续多次调用，可在 MCP server 进程内对 `list` 结果做 5s TTL 内存缓存。
- **R6：CLI 产物体积**
  → MCP server bundle 本体 < 300KB（只含 MCP sdk + prompts + spawner）；openspec 以 external 形式随应用分发（方案 1：直接挂 node_modules，约 1–2MB；方案 2：单文件 bundle，约 1–2MB）。最终打包增量预期 2–3MB。
- **R7：与 `integration-custom-mcp` 未来合并的耦合**
  → Mitigation：`getBundledMcpServers` 的签名与未来 `getUserMcpServers` 对齐，返回同一个 `McpServerSpec` 联合类型；在 `acp-session.ts` 里最终 `[...bundled, ...custom]` 的合并点作为 extension point 提前留好。

## Migration Plan

1. 新建 change、评审、按 tasks 执行；开发环境先 `pnpm dev` 验证。
2. pre-release 跑一次打包（`pnpm build` + electron-builder），在本地 dmg/zip 里验证 `resources/mcp-servers/fyllo-specs/index.js` 存在、可执行。
3. 第一版默认开启，不提供 UI toggle；如需关闭，留出 env `FYLLO_DISABLE_BUNDLED_MCP=1`（由 `bundled-mcp-servers.ts` 读取）作为紧急退路。
4. Rollback：若内置 MCP 导致 ACP session 无法建立，回退 `acp-session.ts:58` 的一行（`mcpServers: []`）即可；打包产物可保留（不执行不产生副作用）。

## Open Questions

- Q1：MCP server 是否需要持久化自己的日志？首版不做——MCP server stderr 已由 ACP agent 捕获，最终会沿 `acp-process-pool` 流到主进程 logger。需要时再加 `mcp-servers/fyllo-specs/src/logger.ts`。
- Q2：openspec CLI 分发方式（§D7 两个方案：直接挂 node_modules vs. 单文件 bundle）—— §1 验证结果确认当前 packaging 可直接保留 `@fission-ai/openspec` 的 CLI / `dist/`，因此最终采纳方案 1，继续沿 pnpm/node_modules 分发。

## §1 验证记录

- 结论 1：`pnpm build:unpack` 成功，`dist/mac/FylloCode.app/Contents/Resources/mcp-servers/fyllo-specs/index.js` 已生成并位于 `Resources/` 外层，可被 ACP agent 直接 spawn。
- 结论 2：遥测关闭继续沿用 `OPENSPEC_TELEMETRY=0` + `DO_NOT_TRACK=1` 双保险，`spawner.ts` 统一注入，未额外引入 patch-package。
- 结论 3：CLI 分发采用方案 1，保留 `@fission-ai/openspec` 的 node_modules 依赖随应用分发，`resolve-cli.ts` 继续按 dev / prod 以及 `FYLLO_OPENSPEC_CLI_PATH` 进行解析。
