## Why

应用从静态 startup shell 导航到正式 Vue renderer 时，当前会从点阵 Logo 短暂回退到旧的静态 Logo 与环形流星 loading，造成明显的视觉跳变。需要让两个启动阶段共享同一套克制、可访问的品牌反馈，使同一窗口的 handoff 在视觉上保持连续。

## What Changes

- 将静态 `startup.html` 与 Vue `StartupLoading.vue` 统一为点阵 FylloCode Logo、稳定字标和“正在启动…”状态文案。
- 在正式 renderer `index.html` 中阻塞加载共享启动样式并预置等价桥接 shell，覆盖整页导航完成到 Vue mount 之间的首帧空档。
- 将点阵尺寸、颜色、密度、扫光节奏、浅色/深色主题和 reduced-motion 降级集中到共享 `startup.css`，避免两套实现漂移。
- 保持静态 startup page 无 renderer JavaScript、继续消费生成的 `/icon.svg`，不复制品牌 SVG path、不增加第三方依赖。
- 移除旧的环形轨道、流星旋转和实心 Logo pulse；允许整页导航后点阵扫光相位重新开始，但 Logo、字标、状态文案和背景不得闪烁或消失。
- 更新启动页与 Vue startup overlay 的聚焦测试，以及 `guidelines/UiDesign.md` 中的启动反馈约定。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `application-lifecycle-orchestration`: 将 startup shell 的品牌 loading 契约从静态 Logo 加环形进度调整为静态 shell 与正式 renderer overlay 共享的点阵 Logo、字标和启动状态视觉。

## Impact

- 受影响代码：`src/renderer/startup.html`、`src/renderer/index.html`、`src/renderer/src/assets/startup.css`、`src/renderer/src/assets/main.css`、`src/renderer/src/components/shared/StartupLoading.vue`。
- 受影响测试：`test/renderer/src/startup-page.spec.ts` 及 Vue startup overlay 的 renderer 组件测试。
- 受影响规范：`openspec/specs/application-lifecycle-orchestration/spec.md`、`guidelines/UiDesign.md`。
- 不影响 Electron 窗口 handoff、renderer bootstrap gate、业务 IPC、公共 API、持久化格式或第三方依赖。
