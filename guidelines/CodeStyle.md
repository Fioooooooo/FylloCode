# 编码规范

Agent 生成代码前必须对照本文档，确保符合所有约束，否则 pre-commit hook 会阻断提交。

## Pre-commit 流程

`simple-git-hooks` 在每次 commit 时触发 `lint-staged`：

| 文件类型               | 执行操作                                    |
| ---------------------- | ------------------------------------------- |
| `*.{js,ts,vue}`        | `eslint --cache --fix` → `prettier --write` |
| `*.{json,md,html,css}` | `prettier --write`                          |

**本地验证命令：**

```bash
pnpm lint      # ESLint 检查（不自动修复）
pnpm format    # Prettier 格式化
pnpm typecheck # TypeScript 类型检查
```

## Prettier 格式规则

| 规则          | 值                                            |
| ------------- | --------------------------------------------- |
| 分号          | 必须有（`semi: true`）                        |
| 引号          | 双引号（`singleQuote: false`）                |
| 行宽          | 100 字符                                      |
| 缩进          | 2 空格（`useTabs: false`）                    |
| 尾随逗号      | ES5 兼容（对象/数组末尾加逗号，函数参数不加） |
| 括号间距      | `{ foo }` 有空格                              |
| 箭头函数括号  | 始终加括号 `(x) => x`                         |
| 换行符        | LF                                            |
| 对象 key 引号 | 按需添加                                      |
| JSX 引号      | 双引号                                        |

**不格式化的文件：** `out/`、`dist/`、`pnpm-lock.yaml`、`typed-router.d.ts`

## EditorConfig 规则

所有文件统一：

- 字符集：UTF-8
- 缩进：2 空格
- 换行符：LF
- 文件末尾：必须有换行
- 行尾空格：自动去除

## ESLint 规则

基于 `@electron-toolkit/eslint-config-ts`（TypeScript 严格规则）+ `eslint-plugin-vue` flat/recommended。

**Vue 文件特殊规则：**

| 规则                             | 配置  | 说明                                    |
| -------------------------------- | ----- | --------------------------------------- |
| `vue/block-lang`                 | error | `<script>` 必须带 `lang="ts"`，不能省略 |
| `vue/require-default-prop`       | off   | Props 不强制要求默认值                  |
| `vue/multi-word-component-names` | off   | 页面组件名可以是单词（如 `index.vue`）  |

**TypeScript 规则（继承自 electron-toolkit）：**

- `noImplicitAny: true` — 禁止隐式 `any`
- 不允许使用 `@ts-ignore`，必须修复类型错误
- 优先使用 `type` 而非 `interface`
- 函数返回值显式标注（推断不明显时）
- 用 `unknown` + 类型守卫替代 `any`

**自动导入 globals：** `@nuxt/ui` 的 composables 和组件通过插件自动注入，ESLint globals 从 `frontend/.eslintrc-auto-import.json` 读取（运行 `pnpm dev` 后生成）。

## Vue 组件规范

组件的架构约束（props/emits 类型化、script 语言、逻辑抽离方式、store / api 分层、路由、样式、图标等）在 [RendererProcess](./RendererProcess.md) 中定义。本节只保留影响代码风格的格式层规则：

- 必须使用 `<script setup lang="ts">`（ESLint `vue/block-lang` 已启用，缺 `lang` 会报错）。
- `<script>` 在 `<template>` 之前。
- 组件文件名 PascalCase；页面组件名不强制多词（ESLint 已关闭 `vue/multi-word-component-names`）。

```vue
<script setup lang="ts">
// Props / Emits 必须带类型声明
const props = defineProps<{
  title: string;
  count?: number;
}>();
const emit = defineEmits<{
  change: [value: string];
  close: [];
}>();
</script>

<template>
  <!-- 模板内不写复杂逻辑，抽到 composables/ 或 utils/ -->
</template>
```

## 样式规范

- 只用 Tailwind CSS utility classes，不写独立 CSS 文件
- 颜色用主题 token（如 `text-primary-500`），不硬编码 `#hex` 或 `rgb()`
- 自定义样式用 `@apply` 或在 `main.css` 中定义 CSS 变量
- 间距用标准值：`gap-2`、`p-4`、`space-y-8` 等

## 图标规范

只用 Lucide 图标集，格式 `i-lucide-<name>`：

```html
<UIcon name="i-lucide-plus" /> <UIcon name="i-lucide-settings" />
```

## 命名规范

### 文件与目录

| 场景            | 规范       | 示例                                  |
| --------------- | ---------- | ------------------------------------- |
| 目录名          | kebab-case | `acp-agents/`、`chat-agent/`          |
| TypeScript 文件 | kebab-case | `acp-agent.ts`、`acp-agents.ts`       |
| Vue 组件文件    | PascalCase | `AgentCard.vue`、`SettingsAgents.vue` |
| 测试文件        | kebab-case | `acp-agent.spec.ts`                   |

**禁止**在目录或非组件文件名中使用驼峰（camelCase）或 PascalCase。

### TypeScript 标识符

| 场景                       | 规范       | 示例                               |
| -------------------------- | ---------- | ---------------------------------- |
| 类型、接口、类、枚举       | PascalCase | `AcpAgentEntry`、`ChatAgent`       |
| 变量、函数、store action   | camelCase  | `acpAgentsStore`、`loadRegistry()` |
| 常量对象（channel 映射等） | PascalCase | `AcpAgentChannels`                 |
| 枚举成员                   | PascalCase | `InstallStatus.Done`               |

### IPC Channel 字符串

格式为 `domain:action`，domain 使用 kebab-case，action 使用 camelCase：

```
acp:getRegistry
acp:installProgress
chat-agent:select
```

**禁止**将 UI 入口路径（如 `settings:`）作为 domain 前缀，domain 应反映功能领域。

### 领域前缀约定

| 领域               | 类型前缀 | Channel 前缀  | Store 文件      |
| ------------------ | -------- | ------------- | --------------- |
| ACP agent 安装管理 | `Acp`    | `acp:`        | `acp-agents.ts` |
| Chat 会话层 agent  | `Chat`   | `chat-agent:` | `chat.ts`       |

## 自动生成文件（禁止手动修改）

| 文件                                  | 生成来源             |
| ------------------------------------- | -------------------- |
| `frontend/auto-imports.d.ts`          | `@nuxt/ui` vite 插件 |
| `frontend/components.d.ts`            | `@nuxt/ui` vite 插件 |
| `frontend/.eslintrc-auto-import.json` | `@nuxt/ui` vite 插件 |
| `frontend/src/typed-router.d.ts`      | `vue-router/auto`    |
| `out/`、`dist/`                       | 构建产物             |
