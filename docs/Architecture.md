# 架构文档

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
├── build/              # 构建资源（图标、entitlements）
├── resources/          # 应用资源
├── shared/             # electron 与 frontend 共享类型、配置
├── data/               # 开发环境数据目录（与 Electron userData 对应，已 gitignore）
│   ├── acp/            # ACP registry、icons、installed 状态和安装缓存
│   ├── integrations/   # 集成连接与凭证配置
│   ├── logs/           # 应用日志
│   ├── projects/       # 项目元数据与项目作用域数据
│   │   └── {projectId}/
│   │       ├── meta.json
│   │       ├── sessions/    # 当前项目的会话记录
│   │       └── workflows/   # 当前项目的自定义工作流
│   ├── settings/       # 用户偏好
│   └── workflows/      # 全局内置工作流文件
├── vitest.config.mts   # Vitest 配置（ESM，.mts 后缀）
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.web.json   # 前端 tsconfig（extends @electron-toolkit/tsconfig）
└── tsconfig.node.json  # 后端 tsconfig（extends @electron-toolkit/tsconfig）
```

### 数据路径规范

业务数据通过 `electron/main/utils/paths.ts` 统一管理：

| 路径函数                         | 开发环境             | 生产环境                                                     |
| -------------------------------- | -------------------- | ------------------------------------------------------------ |
| `getDataSubPath("projects")`     | `data/projects/`     | `~/Library/Application Support/FylloCode/projects/`（macOS） |
| `getDataSubPath("settings")`     | `data/settings/`     | `~/Library/Application Support/FylloCode/settings/`          |
| `getDataSubPath("acp")`          | `data/acp/`          | `~/Library/Application Support/FylloCode/acp/`               |
| `getDataSubPath("integrations")` | `data/integrations/` | `~/Library/Application Support/FylloCode/integrations/`      |
| `getDataSubPath("workflows")`    | `data/workflows/`    | `~/Library/Application Support/FylloCode/workflows/`         |
| `getLogsPath()`                  | `data/logs/`         | `~/Library/Logs/FylloCode/`（macOS）                         |

项目作用域数据统一存放在 `getDataSubPath("projects")/{encodedPath}/`，其中 `{encodedPath}` 由项目路径编码得到。该目录下的 `meta.json` 保存项目元数据，`sessions/` 保存当前项目的会话记录，`workflows/` 保存当前项目的自定义工作流。

Electron 内部缓存（Code Cache、GPU Cache 等）始终使用系统默认路径，不受影响。

## Electron 进程规范

### 进程模型

```
electron/main/index.ts      # 主进程：窗口创建、生命周期、IPC 监听
electron/preload/index.ts   # 预加载：contextBridge 安全暴露 API
electron/preload/index.d.ts # 预加载类型声明（window.electron / window.api）
frontend/src/               # 渲染进程：Vue 3 应用
shared/types/               # 主进程与渲染进程共享的类型
```

IPC 通信：渲染进程通过 `window.electron.ipcRenderer` 调用主进程；新增 channel 时同步更新 `preload/index.d.ts`。

### 主进程 (`electron/main/`)

- 入口 `index.ts` 负责窗口创建、应用生命周期管理、IPC 监听
- 使用 `@electron-toolkit/utils` 提供的工具函数（`electronApp`、`optimizer`、`is`）
- 窗口配置：开发环境通过 `ELECTRON_RENDERER_URL` 加载远程 URL，生产环境加载本地 HTML

### 日志规范

统一使用 `electron-log` v5，通过 `electron/main/utils/logger.ts` 封装后导出：

```ts
import logger from "@main/utils/logger";

logger.info("...");
logger.warn("...");
logger.error("...");
```

- **不得**在主进程业务代码中直接使用 `console.log`
- 渲染进程使用 `import log from 'electron-log/renderer'`，日志通过 IPC 转发到主进程统一写文件

| 环境            | 日志文件路径                                            |
| --------------- | ------------------------------------------------------- |
| 开发            | `<project-root>/data/logs/main.log`                     |
| 生产（macOS）   | `~/Library/Logs/FylloCode/main.log`                     |
| 生产（Windows） | `%USERPROFILE%\AppData\Roaming\FylloCode\logs\main.log` |

### 预加载脚本 (`electron/preload/`)

- 使用 `contextBridge.exposeInMainWorld` 安全暴露 API
- 默认暴露 `window.electron`（`@electron-toolkit/preload` 提供）和 `window.api`（自定义）
- 类型声明在 `index.d.ts` 中维护，渲染进程通过该类型获得 `window.electron` 的类型提示

### IPC 通信规范

- 渲染进程通过 `window.electron.ipcRenderer` 调用主进程
- 主进程通过 `ipcMain.on` / `ipcMain.handle` 监听
- 所有自定义 API 通过 `preload/index.ts` 的 `contextBridge.exposeInMainWorld` 暴露
- 新增 IPC channel 时同步更新 `preload/index.d.ts` 中的类型声明

## 前端概述

渲染进程基于 **Vue 3.5 + TypeScript 6**，使用 **Vite 7** 构建，**@nuxt/ui v4** 提供 UI 组件，**vue-router/auto** 实现文件系统路由。

### Vue 单文件组件

- 必须使用 `<script setup lang="ts">`
- 组件名：PascalCase
- Props 使用 `defineProps<{ ... }>()` 带类型声明
- 事件使用 `defineEmits<{ ... }>()` 带类型声明
- 复杂逻辑抽离到 `composables/` 或 `utils/`，不在模板中内联

### TypeScript

- 严格模式：`noImplicitAny: true`
- 优先使用 `type` 而非 `interface`
- 函数返回值显式标注（除非明显可推断）
- 不使用 `any`，用 `unknown` + 类型守卫替代
- 前端专属类型在 `frontend/src/` 下维护

### 样式

- 使用 Tailwind CSS utility classes，不手写 CSS 文件
- 颜色通过 @nuxt/ui 的主题系统控制，不使用硬编码色值（如 `#ff0000`）
- 布局间距使用标准值：`gap-2`、`p-4`、`space-y-8` 等
- 需要自定义样式时优先使用 Tailwind 的 `@apply` 或在 `main.css` 中定义 CSS 变量

### 图标

- 统一使用 Lucide 图标集（`@iconify-json/lucide`）
- 格式：`i-lucide-<name>`，如 `i-lucide-plus`、`i-lucide-settings`
- 在 `frontend/src/config/auto-icon.ts` 中注册图标集，业务代码直接使用即可

### 路由规范

- 使用文件系统路由：`frontend/src/pages/*.vue` 自动生成路由配置
- 页面组件名不需要遵循多词规则（eslint 已关闭 `vue/multi-word-component-names`）
- 嵌套路由通过目录结构实现：`pages/parent.vue` + `pages/parent/child.vue`
- 动态路由参数：`[id].vue`
- 路由类型由 `vue-router/auto` 自动生成到 `typed-router.d.ts`，提交到版本控制

## 启动预热（Bootstrap）

前端应用使用统一的 bootstrap 入口处理“应用启动后、但不阻塞主流程”的数据预热与初始化任务。

### 设计原则

- app 必须先完成 `mount("#app")`，bootstrap 不得阻塞主界面渲染
- 启动任务统一在 `frontend/src/bootstrap/` 下定义与注册
- 页面组件不应承担全局首次初始化职责，只消费 store 状态；必要时可做轻量兜底
- 单个 bootstrap 任务失败不得影响其他任务，也不得阻塞应用主流程

### 目录与职责

```text
frontend/src/bootstrap/
├── core.ts            # bootstrap 核心：任务注册、runner、上下文类型
├── register.ts        # 内置 bootstrap 任务集中注册入口
└── tasks/
    ├── acp-agents.ts  # ACP agent 数据预热
    └── projects.ts    # persisted projects 数据预热
```

### 启动顺序

1. `frontend/src/main.ts` 创建 app、pinia、router
2. app 完成 `mount("#app")`
3. 调用 `registerBootstrapTasks()` 注册核心任务
4. 以 fire-and-forget 方式调用 `runBootstrapTasks({ pinia, router })`
5. runner 使用并发失败隔离方式执行所有任务

### Store 约束

- bootstrap 任务应优先调用 store 暴露的语义化 action，例如：
  - `useAcpAgentsStore().ensureInitialized()`
  - `useProjectStore().ensureLoaded()`
- store 自己负责：
  - 初始化去重
  - loading 状态回收
  - 错误状态建模
- 不允许由 page/store 模块初始化分散触发全局首次加载

### 当前核心任务

- `acp-agents`
  - 预热 ACP registry、icons、installation status
  - 供 `ChatAgentSelect`、settings agents 面板、session draft agent 解析使用
- `projects`
  - 预热 persisted projects 列表
  - 供 WelcomeView、AppHeader、ProjectSwitcher 等入口使用
