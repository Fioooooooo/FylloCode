# Frontend 测试规范

## 目录结构

```
frontend/src/__tests__/
├── setup.ts              # 全局测试环境初始化（mock、stub 配置）
├── bootstrap/            # 启动预热相关测试
├── components/           # 组件测试
├── stores/               # Pinia store 测试
├── composables/          # composable 测试（待补充）
├── utils/                # 工具函数测试（待补充）
└── AGENTS.md             # 本文件
```

## 命名规范

- 测试文件：`*.spec.ts` 或 `*.test.ts`
- 测试统一放在 `__tests__` 子目录中，按源码目录镜像组织，不与生产代码并置

## 运行命令

```bash
pnpm test           # 运行所有测试（CI 用）
pnpm test:watch     # 监听模式开发
pnpm test:coverage # 生成覆盖率报告
```

## 组件测试策略

本项目使用 `@nuxt/ui`，其组件和 composables 在 Vite 构建时由插件自动注入。在 Vitest 中：

1. **@nuxt/ui/vite 插件** 已集成到 `vitest.config.mts` 中，负责自动导入 composables
2. **第三方 UI 组件** 在 `setup.ts` 中全局 stub，避免运行时解析失败
3. 测试聚焦在 **组件状态与交互逻辑**，不验证 UI 库的内部渲染

### Stub 清单（setup.ts 中已配置）

| 组件                                                             | Stub 方式                          | 说明               |
| ---------------------------------------------------------------- | ---------------------------------- | ------------------ |
| `UButton`                                                        | 渲染为 `<button>`，保留 click 事件 | 可测试点击交互     |
| `UInput`                                                         | 渲染为 `<input>`，保留 v-model     | 可测试输入双向绑定 |
| `UCard`                                                          | 渲染为 `<div>`，保留所有 slot      | 可测试 slot 内容   |
| `UApp`, `RouterView`, `UBadge`, `USelect`, `UCheckbox`, `UAlert` | `true`（空元素）                   | 无需交互验证       |

### 新增 @nuxt/ui 组件的测试适配

如果在业务代码中使用了未在 `setup.ts` 中 stub 的 @nuxt/ui 组件，测试运行时会报 `[Vue warn]: Failed to resolve component: Uxxx`，测试仍能通过但控制台有噪音。

处理方式：

- **需要交互测试** → 在 `setup.ts` 中添加有意义的 stub（参考 UButton）
- **纯展示组件** → 在 `setup.ts` 中设为 `true`

## Composable 测试策略

待项目中有自定义 composables 时，遵循以下原则：

1. 与组件分离，单独放在 `frontend/src/composables/` 目录
2. 测试文件放在 `__tests__/composables/`
3. 重点测试 **状态流转、副作用时机、边界条件**
4. 涉及 IPC 的 composable，优先 mock `window.api`

## 纯函数 / Utils 测试

- 放在 `frontend/src/utils/` 目录
- 测试文件放在 `__tests__/utils/`
- 不依赖 Vue 运行时，使用标准 Vitest API 即可

## Mock 约定

| 目标                                 | 方式                                              | 位置                  |
| ------------------------------------ | ------------------------------------------------- | --------------------- |
| `useToast()` 等 @nuxt/ui composables | `vi.mock('@nuxt/ui/composables')`                 | `setup.ts`            |
| `window.api`                         | 按需在测试文件或 `setup.ts` 中挂载到 `globalThis` | 测试文件 / `setup.ts` |
| `setTimeout` / `interval`            | `vi.useFakeTimers()` / `vi.useRealTimers()`       | 单个测试文件          |

## 覆盖率

- 报告输出到 `./coverage/` 目录
- 已排除：`__tests__/`、`config/`、`assets/`、类型声明文件
- 建议保持 Statements > 80%
