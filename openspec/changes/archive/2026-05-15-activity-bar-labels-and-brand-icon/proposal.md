## Why

当前 Activity Bar 只有图标，依赖悬浮 tooltip 才能识别入口含义。对新用户而言，导航语义不够直观；同时顶部缺少品牌锚点，侧栏视觉层次也偏弱。

## What Changes

- 将 Activity Bar 的主导航项改为“图标 + 文本标签”垂直呈现，直接显示原 tooltip 文案。
- 移除 Activity Bar 导航项的 tooltip 依赖，保留点击导航与高亮逻辑不变。
- 在 Activity Bar 顶部新增 FylloCode 品牌 icon，资源使用 `${import.meta.env.BASE_URL}icon.svg` 引入，以兼容打包后的 `file://` 前端加载。
- 将 Activity Bar 明确组织为三段结构：顶部品牌 icon、中部菜单区、底部 setting 入口。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell-routing`: Activity Bar 的导航呈现从纯图标改为带常驻文本标签，并在顶部增加品牌 icon 的三段式结构。

## Impact

- 影响 `frontend/src/components/layout/ActivityBar.vue` 的结构与样式。
- 影响 `frontend/src/__tests__/components/activity-bar.spec.ts` 的断言内容。
- 不涉及路由契约、IPC、store 或共享类型变更。
