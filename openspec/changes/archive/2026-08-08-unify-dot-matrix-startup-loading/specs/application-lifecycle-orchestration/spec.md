## MODIFIED Requirements

### Requirement: Startup shell 使用克制且可访问的 FylloCode 品牌 loading

Startup shell 与正式 renderer startup overlay SHALL 使用生成的 renderer FylloCode Logo 资产作为点阵轮廓来源，并 SHALL 显示相同尺寸与位置的点阵 Logo、`FylloCode` 字标和“正在启动…”状态文案。系统 SHALL NOT 复制品牌 SVG path、显示虚假百分比或虚构阶段，也 SHALL NOT 使用环形轨道、流星旋转、Logo pulse、bounce、强发光或大面积渐变。正常动画 SHALL 只通过点阵分带 opacity 变化表达不确定启动状态，并 SHALL 支持浅色、深色和 reduced-motion。

静态 `startup.html` SHALL 保持无 renderer JavaScript，并 SHALL 直接消费生成的 `/icon.svg` 作为 CSS mask 与不支持 mask 时的 fallback；正式 renderer `index.html` SHALL 在执行 `main.ts` 前加载 `startup.css` 并在 Vue `#app` 内预置等价桥接 shell；Vue `StartupLoading.vue` SHALL 继续通过 `Logo.vue` 消费同一生成资产作为 fallback。三个渲染阶段 SHALL 共用 `startup.css` 中的背景、点阵、字标、状态文案、主题与 reduced-motion 规则。

#### Scenario: 默认 motion 设置

- **WHEN** 用户未启用 reduced motion
- **THEN** startup shell SHALL 显示始终可辨认的低强度点阵 Logo 基底
- **AND** 六条固定点阵分带 SHALL 以 `2.2s` 周期依次提高 opacity，完成一次克制扫光后停顿
- **AND** 页面 SHALL 显示稳定的 `FylloCode` 字标，并在静态 shell 可见 `0.8s` 后显示“正在启动…”
- **AND** 页面 SHALL NOT 显示环形轨道、旋转流星、虚假百分比、虚构阶段或跳跃进度

#### Scenario: 静态 shell 切换到正式 renderer overlay

- **WHEN** 同一 BrowserWindow 从静态 startup document 导航到正式 renderer且 critical bootstrap 尚未结算
- **THEN** 正式 renderer 的首次绘制 SHALL 显示使用共享 stylesheet 的桥接 shell，不得暴露默认白色文档或空的 Vue `#app` 容器
- **AND** Vue startup overlay SHALL 使用与静态 shell 相同的背景、点阵 Logo 几何、字标和状态文案位置
- **AND** Vue overlay SHALL 在首次渲染时立即保持字标和“正在启动…”可见，不得重播状态文案淡入
- **AND** 点阵扫光相位 MAY 从 Vue document 的起点重新开始，但 Logo 基底、字标、状态文案和背景 SHALL NOT 因此闪烁、消失或跳位

#### Scenario: 用户启用 reduced motion

- **WHEN** `prefers-reduced-motion` 为 `reduce`
- **THEN** startup shell 与正式 renderer startup overlay SHALL 停止点阵扫光和状态文案淡入
- **AND** 两个阶段 SHALL 保留静态点阵 Logo、`FylloCode` 字标与可见的“正在启动…”状态
- **AND** `role="status"`、`aria-live="polite"` 与 `aria-busy="true"` SHALL 继续提供可访问的启动语义

#### Scenario: 系统使用深色主题

- **WHEN** Electron native theme 与 renderer media query 表示深色主题
- **THEN** BrowserWindow background、startup page 与正式 renderer startup overlay SHALL 使用一致的深色 surface
- **AND** 点阵 Logo、字标和状态文案 SHALL 使用对应的深色主题对比度
- **AND** 页面切换 SHALL NOT 出现白色闪烁

#### Scenario: CSS mask 不可用

- **WHEN** startup document 或正式 renderer 不支持 CSS mask
- **THEN** 静态页面 SHALL 显示生成的 `/icon.svg` fallback
- **AND** Vue startup overlay SHALL 显示 `Logo.vue` fallback
- **AND** 两个阶段 SHALL 保留相同的字标、状态文案和启动状态语义
