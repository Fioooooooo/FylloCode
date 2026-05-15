# AGENTS.md

此文件作为 Coding Agent 工作时的必要指导文件，在当前项目中必须按照规定的指令工作。

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

## 目录结构

```
FylloCode/
├── electron/           # Electron 进程代码
│   ├── main/           # 主进程，处理 窗口创建、生命周期、IPC 监听
│   └── preload/        # 预加载脚本，包含 contextBridge 暴露 API、接口类型声明
├── frontend/           # 前端，vite + vue3
├── mcp-servers/        # 内置 MCP server
├── build/              # 构建资源（图标、entitlements）
├── resources/          # 应用资源
├── vitest.config.mts   # Vitest 配置（ESM，.mts 后缀）
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.web.json   # 前端 tsconfig（extends @electron-toolkit/tsconfig）
└── tsconfig.node.json  # 后端 tsconfig（extends @electron-toolkit/tsconfig）
```

## 常用命令

```bash
pnpm dev              # 启动开发服务器
pnpm build            # 类型检查 + 完整构建
pnpm typecheck        # 类型检查（Node + Web）
pnpm lint             # ESLint 检查
pnpm format           # Prettier 格式化
pnpm test             # 运行所有测试（单次）
pnpm test:watch       # 测试监听模式
pnpm test:coverage    # 生成覆盖率报告
```

## 文档归类

如需更多详细信息，Agent 可以主动查看下方的各类详细文档。

- **架构文档** - [Architecture](./docs/Architecture.md)
- **主进程分层** - [MainProcess](./docs/MainProcess.md)
- **渲染进程分层** - [RendererProcess](./docs/RendererProcess.md)
- **数据模型** - [DataModel](./docs/DataModel.md)
- **IPC 通信** - [IPC](./docs/IPC.md)
- **测试规范** - [Testing](./docs/Testing.md)
- **编码规范** - [CodeStyle](./docs/CodeStyle.md)
- **OpenSpec 使用规范** - [OpenSpec](./docs/OpenSpec.md)

若 Agent 准备开展分析、设计、实现、重构、测试或其他 action，必须先主动查阅与任务相关的现有文档，了解规范与约束后，再决定下一步。

## 功能需求规范（OpenSpec）

详细规则见 [OpenSpec 使用规范](./docs/OpenSpec.md)。
