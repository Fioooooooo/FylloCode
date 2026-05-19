# 测试规范

## 总则

- 项目使用 Vitest `projects` 运行两套测试：
  - `renderer`：`happy-dom` 环境，覆盖 `frontend/` 渲染进程代码
  - `main`：`node` 环境，覆盖 `electron/main/` 与 `shared/` 中的可单测模块
- 测试文件**只放在专用 `__tests__` 目录中**，不与生产代码并置，不散落在源码树里。
- 测试目录按源码目录镜像组织，方便从实现快速定位到对应测试。

## 目录结构

```text
frontend/src/__tests__/
├── setup.ts
├── bootstrap/
├── components/
├── stores/
└── ...

electron/main/__tests__/
├── setup.ts
├── bootstrap/
├── domain/
├── infra/
├── ipc/
├── services/
└── ...

shared/__tests__/        # 如需为 shared 模块补测试，统一放这里
```

命名规则：

- 测试文件使用 `kebab-case`
- 文件名使用 `*.spec.ts` 或 `*.test.ts`
- 新增测试时，优先放到对应层级的 `__tests__/` 镜像子目录

## 运行命令

```bash
pnpm test
pnpm test:watch
pnpm test:coverage

# 运行单个 renderer 测试
pnpm vitest run frontend/src/__tests__/components/proposal-detail-header.spec.ts

# 运行单个 main 测试
pnpm vitest run electron/main/__tests__/ipc/_kit/wrap-handler.spec.ts
```

## Renderer 测试

Renderer 测试统一放在 `frontend/src/__tests__/`，运行在 `renderer` project 下。

### 范围

- 组件测试：验证状态、交互和 slot 组合，不测试 UI 库内部实现
- Store 测试：验证状态流转、异步 action、副作用与错误回收
- Bootstrap 测试：验证启动任务注册、并发执行和失败隔离
- 纯前端工具函数测试：如后续新增 `utils/`、`composables/` 测试，也放在同一棵 `__tests__/` 树中

### 全局 setup

`frontend/src/__tests__/setup.ts` 负责：

- mock `@nuxt/ui/composables`（如 `useToast`）
- stub 全局自动注册的 `@nuxt/ui` 组件
- stub `RouterView`、`UApp` 等壳组件，减少无关渲染噪音

当前已提供可交互 stub 的组件包括：

- `UButton`
- `UInput`
- `UCard`
- `UDropdownMenu`

新增 `@nuxt/ui` 组件时：

- 需要交互验证：在 `setup.ts` 中补一个保留关键行为的 stub
- 仅展示用途：直接 stub 为 `true`

### Mock 约定

- 优先 mock `@renderer/api/*` 薄封装，而不是在组件或 store 测试里直接 mock 底层 IPC
- 如果测试对象直接依赖 preload 暴露能力，按实际调用 mock `window.api`
- 定时器相关逻辑在单个测试文件内使用 `vi.useFakeTimers()` / `vi.useRealTimers()`

## Main 测试

Main 测试统一放在 `electron/main/__tests__/`，运行在 `main` project 下。

### 范围

- `domain/`：纯逻辑、解析器、映射器
- `infra/`：纯函数和可隔离的基础设施帮助函数
- `services/`：不依赖真实 Electron 进程即可验证的编排逻辑
- `ipc/_kit/`：请求校验、错误归一化、handler 包装等基础设施

### 全局 setup

`electron/main/__tests__/setup.ts` 负责：

- mock `electron`
- mock `@electron-toolkit/utils`
- mock `electron-log/main`

因此 `pnpm test` 可以在**不启动 Electron** 的情况下直接运行主进程单元测试。

### 编写约定

- 测试优先通过 `@main/*`、`@shared/*` 别名引用实现，避免目录迁移时频繁改相对路径
- handler 的业务逻辑应下沉到 `services/` / `domain/`，测试也优先覆盖下沉后的模块
- 若新增 `shared` 模块测试，统一放在 `shared/__tests__/`

## 覆盖率

- 报告输出到 `./coverage/`
- `__tests__/`、生成文件、类型声明、前端 `config/`、`assets/` 等路径不计入覆盖率
- 目标：`Statements > 80%`
