# 架构文档

FylloCode 的全局架构总览。进程内部细节分别放在
**[MainProcess](./MainProcess.md)**（主进程分层）与
**[RendererProcess](./RendererProcess.md)**（渲染进程分层），
IPC 契约见 **[IPC](./IPC.md)**。

## 项目概述

**FylloCode** — 基于 Electron + Vue 3 + TypeScript 的桌面应用。使用 electron-vite 构建，@nuxt/ui v4 作为 UI 组件库，vue-router/auto 实现文件系统路由。

## 技术栈

| 层       | 技术                                 |
| -------- | ------------------------------------ |
| 桌面框架 | Electron 39                          |
| 前端框架 | Vue 3.5 (Composition API)            |
| 构建工具 | Vite 7 + electron-vite 5             |
| UI 库    | @nuxt/ui 4.6                         |
| 路由     | vue-router/auto (文件系统路由)       |
| 样式     | Tailwind CSS 4                       |
| 语言     | TypeScript 6                         |
| 包管理   | pnpm                                 |
| 测试     | Vitest + @vue/test-utils + happy-dom |
| 校验     | zod（IPC 入参 schema）               |

## 顶层目录

```
FylloCode/
├── electron/           # Electron 进程代码
│   ├── main/           # 主进程（详见 MainProcess.md）
│   └── preload/        # 预加载：contextBridge 暴露 window.api
├── frontend/           # 渲染进程（详见 RendererProcess.md）
├── mcp-servers/        # 内置 MCP server 源码与测试
├── shared/             # 跨进程共享：types / constants / schemas / errors
├── resources/          # 应用随附资源（图标、内置 workflow 模板等）
├── build/              # 构建资源（图标、entitlements）
├── data/               # 开发环境数据目录（gitignore；对应生产 userData）
├── openspec/           # 功能需求规范与 change 提案
├── docs/               # 项目文档（本目录）
├── vitest.config.mts
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.web.json   # 前端 tsconfig
└── tsconfig.node.json  # 主进程 / 预加载 / shared tsconfig
```

## 进程模型

```
┌─────────────────────────────────────────────────────────────────┐
│                      Electron 主进程 (Node)                     │
│  electron/main/                                                 │
│  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌────────┐ ┌───────┐ │
│  │ bootstrap│→ │   ipc   │→ │ services │→ │ domain │ │ infra │ │
│  └──────────┘  └─────────┘  └──────────┘  └────────┘ └───────┘ │
└─────────────────────────────────────────────────────────────────┘
           ↑ ipcMain.handle / stream MessagePort
           │
           │ contextBridge  (electron/preload/)
           │  exposeInMainWorld("api", { chat, project, ... })
           ↓
┌─────────────────────────────────────────────────────────────────┐
│               渲染进程 (Chromium, Vue 3)                        │
│  frontend/src/                                                  │
│  ┌───────┐  ┌────────┐  ┌────────┐  ┌──────┐  ┌───────────┐    │
│  │ pages │→ │ stores │→ │  api   │→ │window│→ │(IPC 主进程)│   │
│  └───────┘  └────────┘  └────────┘  │ .api │  └───────────┘    │
│                                     └──────┘                    │
└─────────────────────────────────────────────────────────────────┘

                    shared/ （types / constants / schemas / errors）
                    由三端共同消费，保持契约一致
```

**边界约束**：

- 主进程：Node + Electron API 的唯一持有者。详见 **[MainProcess](./MainProcess.md)**。
- 渲染进程：只运行 Vue 3 应用，通过 `window.api.*` 调用主进程；不得直接访问 Node / Electron API。详见 **[RendererProcess](./RendererProcess.md)**。
- 预加载脚本：`contextBridge.exposeInMainWorld` 仅暴露 `window.api`（业务 API）；类型声明维护在 `electron/preload/index.d.ts`。
- 共享目录：`shared/types/`（跨进程类型）、`shared/constants/`（错误码、默认值）、`shared/schemas/ipc/`（zod 入参 schema）、`shared/errors/`（`ipcError` 工厂）。
- IPC channel 命名、响应结构、错误码、流式协议见 **[IPC](./IPC.md)**。

## 数据目录

开发环境数据位于项目根 `data/`（已 gitignore），生产环境对应 Electron 的 `userData` / `logs`。

### 路径规范

业务数据通过 `electron/main/infra/paths/index.ts` 统一管理：

| 路径函数                         | 开发环境             | 生产环境                                                     |
| -------------------------------- | -------------------- | ------------------------------------------------------------ |
| `getDataSubPath("projects")`     | `data/projects/`     | `~/Library/Application Support/FylloCode/projects/`（macOS） |
| `getDataSubPath("settings")`     | `data/settings/`     | `~/Library/Application Support/FylloCode/settings/`          |
| `getDataSubPath("acp")`          | `data/acp/`          | `~/Library/Application Support/FylloCode/acp/`               |
| `getDataSubPath("integrations")` | `data/integrations/` | `~/Library/Application Support/FylloCode/integrations/`      |
| `getDataSubPath("workflows")`    | `data/workflows/`    | `~/Library/Application Support/FylloCode/workflows/`         |
| `getLogsPath()`                  | `data/logs/`         | `~/Library/Logs/FylloCode/`（macOS）                         |
| `getResourcesPath()`             | `resources/`         | packaged app 的 `resources/` 根目录                          |

项目作用域路径工厂见 `electron/main/infra/storage/project-paths.ts`：`projectDir` / `sessionsDir` / `applyRunsDir` / `workflowsDir`。**禁止** 在 service / ipc 层直接 `join + encodeProjectPath`。

随应用分发的根目录 `resources/` 内容也通过 `electron/main/infra/paths/index.ts` 获取。生产环境不得在 service / ipc 层直接拼接 `process.resourcesPath`、`app.getAppPath()` 或 `app.asar.unpacked`；这些 Electron 打包布局差异由 `getResourcesPath()` 统一处理。

内置 MCP server bundle 在开发环境从项目根 `out/mcp-servers/` 解析，在生产环境从打包后 `resources/mcp-servers/` 解析；路径差异由主进程 infra 模块统一吸收。

### 目录结构

```
data/
├── acp/                # ACP registry、icons、installed 状态和安装缓存
├── integrations/       # 集成连接与凭证配置
├── logs/               # 应用日志（main.log）
├── projects/           # 项目元数据与项目作用域数据
│   └── {encodedPath}/
│       ├── meta.json       # 项目元数据
│       ├── sessions/       # 当前项目的 chat 会话记录
│       ├── apply-runs/     # 当前项目的 proposal apply 运行状态
│       └── workflows/      # 当前项目的自定义 workflow
├── settings/           # 用户偏好
└── workflows/          # 用户全局 workflow（内置模板首次启动由
                        # resources/workflows/built-in/ 拷贝而来）
```

- `{encodedPath}` 由项目路径通过 `encodeProjectPath()` 编码。
- 内置 workflow 模板是 **只读应用资源**，源在 `resources/workflows/built-in/`；启动时 `initBuiltInWorkflows()` 会通过 `getResourcesPath()` 定位资源根目录，并把模板拷贝到 `data/workflows/` 作为用户可编辑副本。
- Electron 内部缓存（Code Cache、GPU Cache 等）始终使用系统默认路径，不受以上规范影响。

## 日志

- 主进程：`electron-log` v5 通过 `electron/main/infra/logger/index.ts` 导出统一实例。禁止 `console.log`。
- 渲染进程：`import log from "electron-log/renderer"`，日志通过 IPC 转发到主进程统一写文件。
- 详见 [MainProcess](./MainProcess.md#日志)。

| 环境            | 日志文件路径                                            |
| --------------- | ------------------------------------------------------- |
| 开发            | `<project-root>/data/logs/main.log`                     |
| 生产（macOS）   | `~/Library/Logs/FylloCode/main.log`                     |
| 生产（Windows） | `%USERPROFILE%\AppData\Roaming\FylloCode\logs\main.log` |

## 文档索引

| 主题                 | 文档                                    |
| -------------------- | --------------------------------------- |
| 主进程分层 + IPC kit | [MainProcess](./MainProcess.md)         |
| 渲染进程分层 + Vue   | [RendererProcess](./RendererProcess.md) |
| IPC 契约与 channel   | [IPC](./IPC.md)                         |
| 数据模型             | [DataModel](./DataModel.md)             |
| 编码规范（格式层）   | [CodeStyle](./CodeStyle.md)             |
| 测试规范             | [Testing](./Testing.md)                 |
| OpenSpec 使用        | [OpenSpec](./OpenSpec.md)               |
