## 1. 共享点阵启动视觉

- [x] 1.1 将 `src/renderer/startup.html` 中已验证的内联点阵、字标、状态文案、主题和 reduced-motion 样式迁移到 `src/renderer/src/assets/startup.css`，删除旧的 `fyllo-startup-orbit`、环形轨道、流星高亮和 Logo pulse；保留 `144px × 126px` Logo、`8px` 点阵、六条分带、`0.32` 基底 opacity、`2.2s` 扫光周期与 `0.1s` 分带延迟。
- [x] 1.2 精简 `src/renderer/startup.html` 为无 `<script>` 的静态结构，保留 `/icon.svg` fallback、六条点阵分带、`FylloCode` 字标、延迟 `0.8s` 显示的“正在启动…”和既有 `role="status"` / `aria-live="polite"` / `aria-busy="true"` 语义；确认页面不复制 SVG path、不包含百分比或虚构阶段。
- [x] 1.3 更新 `src/renderer/src/components/shared/StartupLoading.vue`，使用与静态页面等价的点阵/字标/状态 markup，并继续以 `Logo.vue` 作为 CSS mask 不可用时的 fallback；让 Vue overlay 的“正在启动…”首次渲染即保持可见且不重播淡入，确保除扫光相位外的几何和文案在 handoff 时不跳变。
- [x] 1.4 在 `src/renderer/index.html` 的 Vue `#app` 容器内预置等价的桥接 loading，并在 `<head>` 中阻塞加载共享 `startup.css`；从 `main.css` 移除重复导入，确保正式文档首帧到 Vue mount 期间不暴露默认白底或空容器。

## 2. 测试与视觉验证

- [x] 2.1 更新 `test/renderer/src/startup-page.spec.ts`，断言静态页面继续只加载共享 stylesheet 与生成图标、没有 renderer script/品牌 path/虚假百分比，并覆盖六条点阵分带、`2.2s` 周期、`0.8s` 状态延迟、旧圆环移除、mask fallback 和 reduced-motion 静态规则。
- [x] 2.2 新增 `test/renderer/src/components/startup-loading.spec.ts`，通过 renderer project 挂载 `StartupLoading.vue`，断言 `Logo.vue` fallback、六条点阵分带、字标、立即可见的状态文案和 `role="status"` / `aria-live="polite"` / `aria-busy="true"` 语义；测试不得依赖 Nuxt UI 内部实现。
- [x] 2.3 扩展 `test/renderer/src/startup-page.spec.ts`，断言正式 renderer 在 `main.ts` 执行前加载共享 stylesheet，且 `#app` 内的桥接 shell 保持六条点阵分带、生成图标、字标和状态文案；`main.css` 不重复导入启动样式。
- [x] 2.4 运行 `pnpm exec vitest run --project renderer test/renderer/src/startup-page.spec.ts test/renderer/src/components/startup-loading.spec.ts test/renderer/src/app-startup.spec.ts`、`pnpm typecheck:web`、`pnpm lint` 和 Prettier 检查；在 `pnpm dev` 下人工验证浅色、深色、reduced-motion 以及静态 shell → 正式 HTML 桥接 shell → Vue overlay → Launcher 的完整 handoff，确认无白闪、旧圆环回退、Logo/字标/状态跳位或相关控制台错误。

## 3. 工程约定同步

- [x] 3.1 更新 `guidelines/UiDesign.md` 的“启动反馈”规则：以共享点阵 Logo、字标和状态文案替代环形进度与 Logo pulse，记录静态 shell 状态延迟、Vue overlay 立即可见、跨文档仅允许扫光相位重启，以及浅色/深色/reduced-motion 和无 renderer JavaScript 约束；保留 `guidelines/BrandAssets.md` 的生成图标单一来源规则不变。
