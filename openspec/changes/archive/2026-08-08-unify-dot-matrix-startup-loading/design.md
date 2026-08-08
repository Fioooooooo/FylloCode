## Context

FylloCode 冷启动先显示无 JavaScript 的 `src/renderer/startup.html`，required gate 通过后在同一 `BrowserWindow` 导航到正式 renderer。Vue 应用 mount 后，如果 critical bootstrap 尚未结算，`src/renderer/src/components/shared/StartupLoading.vue` 会继续覆盖窗口。当前原型只在 `startup.html` 内联点阵样式，因此正式 renderer 接管时会回退到 `startup.css` 中旧的圆环与实心 Logo，随后才进入 Launcher。

整页导航会销毁静态文档 DOM，CSS animation phase 无法原样延续；本设计追求背景、几何、品牌元素与状态文案的感知连续，不承诺跨文档保持同一动画帧。实现必须继续满足静态页面无 renderer JavaScript、生成品牌资产单一来源、浅色/深色主题一致和 reduced-motion 可访问性。

## Goals / Non-Goals

**Goals:**

- 让 `startup.html` 与 `StartupLoading.vue` 使用同一套点阵 Logo、FylloCode 字标和“正在启动…”状态视觉。
- 将视觉参数和降级规则集中在 `src/renderer/src/assets/startup.css`，避免静态与 Vue 两套 CSS 漂移。
- 在正式 renderer handoff 时保持背景、Logo 尺寸、字标和状态文案稳定，仅允许点阵扫光相位重新开始。
- 保持生成的 `/icon.svg` / `Logo.vue` 为品牌轮廓来源，不复制品牌 path、不增加依赖。

**Non-Goals:**

- 不改变 main 进程 startup gate、同窗 handoff、renderer critical/background bootstrap 或 interactive signal。
- 不通过脚本同步两个文档的动画时间轴，也不引入跨文档 View Transition。
- 不加入百分比、虚构阶段、粒子背景、光晕、旋转轨道或其他装饰动效。
- 不改变 Launcher、Workspace 页面或 Vue startup overlay 以外的 renderer UI。

## Decisions

### 共享 CSS，在三个渲染阶段保留等价的最小 markup

将 `startup.html` 当前内联的点阵、字标和状态样式迁移到 `src/renderer/src/assets/startup.css`。静态 startup document、正式 renderer HTML 的 Vue 挂载前桥接 shell 与 Vue SFC 无法共享组件，因此三处保留结构等价的最小 markup，并使用相同 class：`fyllo-startup-stage`、`fyllo-startup-ring`、`fyllo-startup-dot-logo`、`fyllo-startup-dot-layer`、`fyllo-startup-lockup`、`fyllo-startup-wordmark` 和 `fyllo-startup-status`。测试同时断言关键结构，防止后续漂移。

正式 renderer 的 `index.html` 在 `<head>` 中阻塞加载共享 `startup.css`，并在空的 Vue `#app` 容器内预置桥接 shell。这样整页导航后的首次绘制就具备正确主题背景和完整 loading；`main.ts` 完成依赖求值后，Vue mount 在同一同步更新中将桥接 shell 替换为 `StartupLoading.vue`，不会暴露浏览器默认白色文档或空容器。`main.css` 不再重复导入 `startup.css`。

替代方案是继续在 `startup.html` 内联完整 CSS、在 Vue 中复制一份；该方案会使尺寸、主题和动效节奏长期分叉，因此不采用。

### 使用生成图标作为 mask 与 fallback

点阵层使用 `/icon.svg` 作为 CSS mask，只以 `radial-gradient` 生成点阵纹理，不复制 SVG path。`startup.html` 保留生成图标 `<img>` 作为不支持 mask 时的 fallback；`StartupLoading.vue` 保留 `Logo.vue` 作为对应 fallback，以满足现有品牌资产边界。支持 mask 时 fallback 隐藏，点阵层显示；不支持时点阵层隐藏并显示静态生成 Logo。

替代方案是手工列出 Logo 点坐标。该方案等同维护第二份品牌形状，并会随品牌图标变化而漂移，因此不采用。

### 固定视觉参数与克制动效

共享点阵 Logo 使用 `144px × 126px` 容器、`8px` 网格和 `1.8px` 点半径。基础点阵保持 `0.32` opacity，六条固定分带以 `0.1s` 依次延迟，在 `2.2s` 周期内完成一次亮度扫过并留出停顿。动画只改变 opacity，不移动 Logo、不旋转、不改变布局。

字标使用系统 sans-serif、`16px`/`600`；状态文案使用 `12px` 弱化颜色。静态 shell 的状态文案在 `0.8s` 后淡入，避免极快启动时出现短促文字闪烁；Vue overlay 初次渲染即显示状态文案，不重播淡入，避免 handoff 时文案消失再出现。

替代方案是保留 `1.6s` 环形旋转或使用连续高频点阵起伏。前者无法解决视觉回退，后者会让启动反馈显得焦躁，因此不采用。

### 以稳定基底掩盖跨文档动画重启

整页导航后 Vue 点阵动画从自身起点重新计时。两个阶段均保持 `0.32` 的基础点阵、相同几何与相同背景，且不对整个 overlay 添加 fade-in；因此重启只影响高亮分带位置，不会让 Logo、字标或状态文案闪烁。正式 renderer 继续依赖既有 BrowserWindow/background 与 startup overlay 机制避免白闪。

### Reduced motion 与主题

`prefers-reduced-motion: reduce` 下禁用点阵扫光和状态淡入，显示静态高对比点阵及立即可见的状态文案。浅色与深色继续使用现有 startup surface 和 teal accent，并为字标、状态文案分别声明主题变量；不增加大面积渐变或发光。

## Risks / Trade-offs

- [整页导航导致扫光相位重启] → 保持基础点阵、几何、文案与背景稳定，把可见差异限制为高亮位置变化；不承诺帧级连续。
- [静态 HTML 与 Vue markup 仍可能漂移] → 共用 CSS class，并在 renderer 测试中覆盖两种结构的点阵分带数量、字标和状态语义。
- [CSS mask 在异常环境不可用] → 静态页面回退到 `/icon.svg`，Vue overlay 回退到 `Logo.vue`，仍保留字标和状态文案。
- [状态文案延迟在 handoff 后重复] → 延迟只作用于 `.fyllo-startup-page`，Vue `.fyllo-startup-overlay` 强制立即可见且无进入动画。

## Migration Plan

1. 将 `startup.html` 原型样式迁入共享 `startup.css`，保持静态页面无 `<script>`。
2. 让 `StartupLoading.vue` 使用等价点阵结构和 `Logo.vue` fallback，删除旧环形视觉依赖。
3. 在正式 renderer `index.html` 中预置使用共享样式的桥接 shell，覆盖文档导航到 Vue mount 之间的首帧空档。
4. 更新静态、桥接 shell 与 Vue 聚焦测试，并人工检查浅色、深色、reduced-motion 及 startup shell 到 Vue overlay 的 handoff。
5. 若视觉回归，可回退相关 renderer 文件和对应测试；不涉及数据迁移或外部兼容处理。

## Open Questions

无。点阵尺寸、`2.2s` 周期、字标、状态延迟和跨文档相位重启边界均已在原型评审中确认。
