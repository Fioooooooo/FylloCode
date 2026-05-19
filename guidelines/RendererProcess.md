# 渲染进程规范（RendererProcess）

渲染进程（`frontend/`）是运行在 Chromium 环境中的 Vue 3 单页应用。所有主进程能力通过 `window.api` 暴露；渲染进程不得直接访问 Node / Electron API。

## 启动顺序

```
frontend/src/main.ts
  1. 引入全局样式 (assets/main.css)
  2. 引入图标集 (config/auto-icon)
  3. 创建 router、pinia、vue app
  4. app.use(pinia).use(router).use(ui).mount("#app")
  5. registerBootstrapTasks()          // 登记预热任务
  6. runBootstrapTasks({ pinia, router })  // fire-and-forget
```

必须先 `mount("#app")` 再启动 bootstrap；bootstrap **不得** 阻塞首屏渲染。

## 目录结构

```
frontend/src/
├── main.ts          # 入口：创建 app、挂载、触发 bootstrap
├── App.vue          # 根组件：Suspense + UApp + AppLayout + <RouterView />
├── layouts/         # 布局组件（AppLayout.vue）
├── pages/           # 文件系统路由页（vue-router/auto 自动生成）
├── components/      # 按业务域拆分的 UI 组件
│   ├── chat/
│   ├── integration/
│   ├── layout/      # 通用布局件：ActivityBar / AppHeader / ProjectSwitcher
│   ├── proposal/
│   ├── settings/
│   └── workflow/
├── stores/          # Pinia stores：状态 + 异步 action 的唯一来源
├── api/             # 对 window.api.<domain> 的薄封装（与主进程 IPC 一一对应）
├── bootstrap/       # 启动预热：core + register + tasks/*
├── config/          # 全局配置：auto-routes、auto-icon
├── utils/           # 跨组件的纯工具函数
├── types/           # 仅前端使用的类型（跨进程类型放 shared/types）
├── assets/          # 图片、CSS（main.css 通过 main.ts 引入）
├── __tests__/       # 测试专属 fixture / setup / 所有渲染进程测试
├── typed-router.d.ts  # 由 vue-router/auto 生成（已纳入版本控制，禁手改）
└── vite-env.d.ts
```

## 分层与依赖方向

```
pages/ + layouts/ + components/      (UI 层)
           ↓
        stores/                      (状态 + 业务编排)
           ↓
          api/                       (IPC 薄封装：window.api.* 的唯一入口)
           ↓
    主进程 (IPC)                     — 通过 @shared/types 约束
```

| 层            | 职责                                                      | 禁止                                          |
| ------------- | --------------------------------------------------------- | --------------------------------------------- |
| `pages/`      | 路由单元，组合 layout + components，调 store 的 action    | 发起 IPC、操作 DOM 全局状态                   |
| `layouts/`    | 骨架，提供具名 slot 给 App.vue 组合                       | 内联业务逻辑                                  |
| `components/` | 呈现、交互；props/emits 类型化                            | 跨域调用另一域的私有组件、直接访问 window.api |
| `stores/`     | 持久化状态、loading/error 建模、async actions、去重初始化 | 直接 `window.api.*`；用 api/ 模块代理         |
| `api/`        | 一行转发到 `window.api.<domain>.<method>`                 | 业务逻辑、状态缓存                            |

关键原则：**任何 `window.api.*` 调用都必须经过 `frontend/src/api/` 对应模块**。页面、组件、store 都不得直接 `window.api.xxx()`。

## Vue 组件规范

```vue
<script setup lang="ts">
// Props：类型声明，默认值可选
const props = defineProps<{
  title: string;
  count?: number;
}>();

// Emits：类型声明
const emit = defineEmits<{
  change: [value: string];
  close: [];
}>();

// 复杂逻辑抽到 composables / utils，不在 template 内联
</script>

<template>
  <!-- 模板中禁止复杂表达式 -->
</template>
```

- 必须使用 `<script setup lang="ts">`（ESLint `vue/block-lang` 已启用）。
- 组件名：PascalCase（文件名也是 PascalCase，page 除外）。
- Props：`defineProps<{...}>()` 带类型声明；不强制默认值。
- Emits：`defineEmits<{...}>()` 带类型声明。
- 复杂逻辑抽离到 `composables/` 或 `utils/`。
- 格式层规则（分号、引号、行宽等）见 [CodeStyle](./CodeStyle.md)。

## 路由

- **文件系统路由**：`frontend/src/pages/*.vue` 自动生成路由配置，配置在 `config/auto-routes.ts`。
- **页面名**：eslint 关闭了 `vue/multi-word-component-names`，`index.vue` 之类的单词名允许。
- **嵌套路由**：`pages/parent.vue` + `pages/parent/child.vue`。
- **动态路由**：`[id].vue`。
- **类型生成**：`vue-router/auto` 自动写入 `typed-router.d.ts`，此文件**提交到版本控制**、**禁止手动修改**。
- `config/auto-routes.ts` 负责 `createRouter` + 开发期 HMR。

## Store（Pinia）

Pinia store 是状态与编排的唯一入口：**页面与组件只消费 store，不自己发起 IPC**。

### 约束

- 每个 store 自己负责：
  - **初始化去重**：维护 `initialized` / `initializing` 标志，`ensureInitialized()` 幂等。
  - **loading 状态回收**：try/finally 确保失败也能复位。
  - **错误状态建模**：`xxxError` 字段供 UI 展示，不抛到页面组件。
- **不允许** 由多个页面/组件分散触发"同一份全局数据"的首次加载；这类初始化走 `bootstrap/tasks/*`。
- 跨 store 依赖通过 composable 模式（`useXStore()` 调 `useYStore()`）。

### 命名与文件

- `frontend/src/stores/<domain>.ts`，每个文件导出 `useXxxStore`。
- store id 使用 kebab-case：`defineStore("acp-agents", ...)`。
- 同步 state 用 `ref()`；派生值用 `computed()`；异步动作显式返回 `Promise`。

### 典型套路

```ts
export const useFooStore = defineStore("foo", () => {
  const items = ref<Foo[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const initialized = ref(false);
  const initializing = ref(false);

  async function ensureInitialized(): Promise<void> {
    if (initialized.value || initializing.value) return;
    initializing.value = true;
    loading.value = true;
    try {
      const res = await fooApi.list();
      if (!res.ok) throw new Error(res.error.message);
      items.value = res.data;
      initialized.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
      initializing.value = false;
    }
  }

  return { items, loading, error, ensureInitialized };
});
```

## API 层

`frontend/src/api/<domain>.ts` 是 `window.api.<domain>` 的**薄包装**，每个文件导出 `xxxApi` 对象：

```ts
// frontend/src/api/project.ts
import type { IpcResponse } from "@shared/types/ipc";
import type { ProjectInfo } from "@shared/types/project";

export const projectApi = {
  list(): Promise<IpcResponse<ProjectInfo[]>> {
    return window.api.project.list();
  },
  getById(id: string): Promise<IpcResponse<ProjectInfo | null>> {
    return window.api.project.getById({ id });
  },
  // ...
};
```

**API 层只负责**：类型化参数 + 转发 + 类型化返回。**禁止**：业务判断、缓存、ipc 错误的 `toast` 或 UI 提示（那是 store 的活）。

流式 API（如 chat 的 `streamMessage`）在 preload 层就封装成了 `(input, { onChunk, onDone, onError }) => cancel` 回调式接口，API 层同样是薄转发。

调用方式：`store` 或 `composables` `import { projectApi } from "@renderer/api/project"`，返回 `IpcResponse<T>`，`if (res.ok) { ... } else { ... }` 分支处理。

## Integration 渲染层落点

本次 integration 改为“settings 管 provider 凭证，`/integration` 管项目资源挂载”后，渲染层职责如下：

- `frontend/src/integrations/providers.ts`
  - provider manifest 单一事实源
  - 声明 provider 的 `authType`、`credentialFields`、`capabilities`、`comingSoon`
- `frontend/src/stores/integration.providers.ts`
  - provider 列表、连接状态、资源列表缓存、项目级挂载配置的唯一状态入口
  - 负责调用 `frontend/src/api/integration.ts`
  - 负责 settings 与 `/integration` 共用的搜索词、loading 态、资源选项缓存
- `frontend/src/components/settings/SettingsIntegrationProviders.vue`
  - settings 内 tab 视图，不新增子路由
  - 支持 `?tab=integration-providers&focus=<providerId>` 定位 provider 卡片
- `frontend/src/components/settings/IntegrationProviderCard.vue`
  - provider 级连接/断开/过期回显
  - 当前仅 `yunxiao` 提供真实 API Token 连接表单
- `frontend/src/components/integration/ProviderStageSection.vue`
  - `/integration` 页面阶段区块
  - 展示已挂载 provider 卡片、资源标签、资源选择面板、未连接跳转引导
- `frontend/src/pages/settings.vue`
  - 继续沿用现有 tab 切换模式；不得为了 integration-provider 视图把整个 settings 改造成子路由
- `frontend/src/pages/integration.vue`
  - 只负责当前项目维度的阶段资源挂载，不承载凭证写操作

实现上的硬约束：

- 页面与组件不得直接调用 `window.api.integration.*`，只能通过 `integrationApi` 和 store。
- provider 未连接或已过期时，`/integration` 只显示跳转到 settings 的引导，不得在页面内再次嵌入连接表单。
- 搜索语义分两层：
  - settings 与 `/integration` 顶部搜索：按 provider 名称 / 描述 / capability 过滤 provider
  - 资源选择面板内搜索：按 provider 资源列表的 query 拉取远端结果

## 启动预热（Bootstrap）

### 设计原则

- `mount("#app")` **必须** 先完成，bootstrap **不得** 阻塞首屏。
- 启动任务统一在 `frontend/src/bootstrap/` 下定义与注册。
- 页面组件不承担全局首次初始化职责，只消费 store 状态；必要时可做轻量兜底。
- 单个 bootstrap 任务失败**不得** 影响其他任务，也**不得** 阻塞主流程。

### 目录与职责

```
frontend/src/bootstrap/
├── core.ts       # 任务注册、runner、上下文类型
├── register.ts   # 内置任务集中注册入口
├── index.ts      # 对外 re-export
└── tasks/
    ├── acp-agents.ts  # ACP agent 数据预热
    └── projects.ts    # persisted projects 预热
```

### runner 行为

- 任务通过 `onFylloBootstrap({ name, run })` 注册。
- `runBootstrapTasks(ctx)` 使用 `Promise.allSettled` **并发** 执行所有任务。
- 任一任务抛错 → 打日志 + 其他任务继续跑；不会把 error 冒泡到 `main.ts`。

### 新增任务

1. 新建 `frontend/src/bootstrap/tasks/xxx.ts`，导出 `registerXxxTask()`：

   ```ts
   import { onFylloBootstrap } from "../core";
   import { useXxxStore } from "@renderer/stores/xxx";

   export function registerXxxTask(): void {
     onFylloBootstrap({
       name: "xxx",
       async run({ pinia }) {
         await useXxxStore(pinia).ensureInitialized();
       },
     });
   }
   ```

2. 在 `bootstrap/register.ts` 调用 `registerXxxTask()`。
3. task 只调 store 的语义化 action（`ensureInitialized` / `ensureLoaded`），不内联 fetch 逻辑。

### 当前任务

- `acp-agents` — ACP registry、icons、installation status 预热，供 `ChatAgentSelect`、settings agents 面板、session draft agent 解析使用。
- `projects` — persisted projects 列表预热，供 WelcomeView、AppHeader、ProjectSwitcher 使用。

## 样式

- 只用 Tailwind CSS utility classes；不写独立 `.css`。
- 颜色用 @nuxt/ui 主题 token（`text-primary-500` 等），不硬编码 `#hex` / `rgb()`。
- 需要自定义样式时：Tailwind 的 `@apply` 或 `assets/main.css` 中定义 CSS 变量。
- 间距用标准值：`gap-2` / `p-4` / `space-y-8`。

## 图标

- 统一使用 Lucide 图标集（`@iconify-json/lucide`）。
- 格式：`i-lucide-<name>`，如 `i-lucide-plus`、`i-lucide-settings`。
- 在 `config/auto-icon.ts` 中一次性 `addCollection(lucide)`，业务代码直接 `<UIcon name="i-lucide-plus" />`。

## TypeScript

- 严格模式：`noImplicitAny: true`。
- 优先 `type` 而非 `interface`。
- 函数返回值显式标注（除非一眼可推断）。
- 不使用 `any`，用 `unknown` + 类型守卫替代。
- **跨进程类型** 放 `@shared/types/<domain>`；**仅前端使用的类型** 放 `frontend/src/types/`。
- 路径别名：`@renderer/*` → `frontend/src/*`，`@shared/*` → `shared/*`。

## 测试

- Vitest + happy-dom + `@vue/test-utils`。
- 测试文件统一放在 `frontend/src/__tests__/`，按源码目录镜像组织，不与生产代码并置。
- `frontend/src/__tests__/setup.ts` 统一处理 `@nuxt/ui` stub 和常用全局 mock。
- Renderer 项目跑在 `vitest.config.mts` 的 `renderer` workspace 下；`main` workspace 只跑主进程测试。

## 新增一个"页面 + store + IPC 消费者"的完整流程

假设要加一个 `/foo` 页面，显示主进程提供的 foo 列表。

1. **主进程侧**：按 [MainProcess](./MainProcess.md) 和 [IPC](./IPC.md) 的流程加 channel + schema + service + handler + preload API + `preload/index.d.ts`。
2. **API 层**：`frontend/src/api/foo.ts` 写 `fooApi.list()` 一行转发。
3. **Store**：`frontend/src/stores/foo.ts` 定义 `useFooStore`，实现 `ensureInitialized` + `items` + `loading` + `error`。
4. **（可选）Bootstrap**：若 foo 需要在启动时预热，加 `bootstrap/tasks/foo.ts` 并在 `register.ts` 注册。
5. **页面**：`frontend/src/pages/foo.vue`：
   ```vue
   <script setup lang="ts">
   import { useFooStore } from "@renderer/stores/foo";
   const foo = useFooStore();
   onMounted(() => foo.ensureInitialized());
   </script>
   ```
6. **组件**：如有复用需要，`frontend/src/components/foo/FooCard.vue` 等。
7. **类型**：跨进程类型在 `@shared/types/foo.ts`；仅前端类型在 `frontend/src/types/foo.ts`。
8. **测试**：为 store 补 `*.spec.ts`。

## 常见违规与修复

| 现象                                             | 修复                                                     |
| ------------------------------------------------ | -------------------------------------------------------- |
| 组件里 `window.api.xxx.yyy()`                    | 下沉到 `frontend/src/api/xxx.ts`，组件改调 store         |
| 页面里 `fetch(...)` 或 `ipcRenderer.invoke(...)` | 同上；渲染进程不得碰原生 IPC                             |
| 多个组件都各自 `load()` 同一份数据               | 抽到 store 的 `ensureInitialized()`，或加 bootstrap 任务 |
| Store action 失败后 UI 卡 loading                | 用 `try/finally` 复位 `loading`                          |
| `typed-router.d.ts` 出现 merge 冲突              | 删除文件 → `pnpm dev` 一次即重新生成                     |
| `<script>` 缺 `lang="ts"`                        | ESLint `vue/block-lang` 会报错                           |
