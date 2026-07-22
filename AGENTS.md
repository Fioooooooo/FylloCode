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
├── src/
│   ├── main/           # Electron 主进程，处理窗口、生命周期、IPC 监听
│   ├── preload/        # 预加载脚本，包含 contextBridge 暴露 API、接口类型声明
│   ├── renderer/       # 前端，vite + vue3
│   ├── shared/         # 跨进程共享类型、schema、常量与错误对象
│   └── mcp-servers/    # 内置 MCP server
├── test/               # 与 src/ 平级，内部按 src/ 镜像组织测试
├── references/         # 参考资料（designs/ 自身设计方案，third-party/ 第三方调研）
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

## Worktree 环境准备

在本次 Agent 会话中，如果当前 worktree 尚未验证过本地环境，且需要运行项目命令，先运行一次：

```shell
sh scripts/prepare-worktree-env.sh
```

该脚本会定位当前 worktree 根目录，按 `.nvmrc` 切换 Node 版本，并在依赖缺失、锁文件不一致或 `node_modules` 为软链时按 `pnpm-lock.yaml` 安装依赖。

同一会话、同一 worktree 中，脚本成功后无需重复执行；只有切换到另一个 worktree、Node/pnpm 命令不可用、`pnpm-lock.yaml` 变化，或怀疑依赖目录不完整时才需要重新运行。

## Project Guidelines Index

- **Architecture** - [Architecture](guidelines/Architecture.md)
- **MainProcess** - [MainProcess](guidelines/MainProcess.md)
- **Quality Gates** - [Quality Gates](guidelines/QualityGates.md)
- **Renderer Feature Architecture** - [Renderer Feature Architecture](guidelines/RendererFeatures.md)
- **RendererProcess** - [RendererProcess](guidelines/RendererProcess.md)
- **Testing** - [Testing](guidelines/Testing.md)
- **UiDesign** - [UiDesign](guidelines/UiDesign.md)
- **CodeComments** - [Code Comments](guidelines/CodeComments.md)

Coding Agents must read the relevant guideline documents before changing covered areas.
