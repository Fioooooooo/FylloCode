---
name: Brand Assets
description: Governs FylloCode brand icon sources, generated copies, platform outputs, consumers, and synchronization commands.
keywords: [brand, icon, svg, assets, build]
---

# Brand Assets

## 范围

- 覆盖：`resources/app-icon.svg`、`resources/icon.svg`、图标生成脚本、renderer/docs 品牌图标副本、BrowserWindow 运行时 PNG 和 electron-builder 平台图标。
- 不覆盖：Iconify/Lucide UI icon、ACP agent icon cache、文档截图和普通功能图标。

## 文件职责

| 文件                                                  | 职责                                                           | 维护方式                                               |
| ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `resources/icon.svg`                                  | 无底板、无外围留白、无边框、无阴影的纯 FylloCode 图标          | 手工维护                                               |
| `resources/app-icon.svg`                              | App Icon 的 1024px 画布、底板、圆角、边框、阴影和品牌图形布局  | 手工维护容器；`icon.svg` data URI 由 `icon:build` 刷新 |
| `src/renderer/public/icon.svg`                        | renderer public 品牌图标                                       | 由 `icon:build` 同步，禁止手改                         |
| `docs/public/assets/fyllocode.svg`                    | VitePress 首页品牌图标                                         | 由 `icon:build` 同步，禁止手改                         |
| `resources/app-icon.png`                              | `src/main/bootstrap/window.ts` 导入的 BrowserWindow 运行时图标 | 由 `icon:build` 生成，禁止手改                         |
| `build/icon.png`、`build/icon.icns`、`build/icon.ico` | electron-builder 使用的平台图标                                | 由 `icon:build` 生成，禁止手改                         |

证据：`scripts/icon/assets.mjs`、`scripts/icon/build.mjs`、`src/main/bootstrap/window.ts`、
`electron-builder.yml`。

`out/renderer/icon.svg` 和 `docs/.vitepress/dist/assets/fyllocode.svg` 是被 `.gitignore` 排除的
本地构建输出，不是图标源，也不由 `icon:build` 维护。需要检查最终应用或文档产物时，运行对应
构建重新生成，不得提交或反向同步这些缓存。

## 规则

- MUST 只在 `resources/icon.svg` 中修改品牌路径和颜色。该文件不得包含 `<rect>`、
  `<filter>` 或 `<feDropShadow>`；App Icon 的容器效果属于 `resources/app-icon.svg`。
- MUST 让 `resources/app-icon.svg` 使用带 `data-icon-source="icon.svg"` 标记的 `<image>`，
  并由 `icon:build` 将纯图标刷新为自包含 data URI，使本地预览器无需加载外部 SVG。不得再次
  复制品牌 `<path>`；修改底板、圆角、边框、阴影或图形布局时，只修改该文件的容器部分。
- MUST 在修改任一手工维护 SVG 后运行 `pnpm icon:build`，让 renderer、docs、运行时 PNG
  和平台图标一起更新。该命令入口与输出见 `package.json` 和 `scripts/icon/build.mjs`。
- MUST NOT 手工修改 renderer/docs SVG 副本、`resources/app-icon.png` 或 `build/icon.*`。
  `pnpm icon:check` 会在 CI 中检查 SVG 副本和源文件是否漂移。
- MUST 让 renderer 品牌图标通过 `src/renderer/src/components/shared/Logo.vue` 消费生成的
  public SVG。需要单色图标时使用其 `neutral` 模式，不得在 Vue 组件重新声明品牌路径。
- MUST 保留 `build/icon.png`、`build/icon.icns` 和 `build/icon.ico` 的文件名；
  `electron-builder.yml` 将 `build/` 作为 `buildResources`。

## 修改流程

1. 修改纯品牌图形时编辑 `resources/icon.svg`；修改 App Icon 容器效果时编辑
   `resources/app-icon.svg`。
2. 先运行 `pnpm icon:check` 查看是否存在旧副本，再运行 `pnpm icon:build` 重新生成。
3. 检查 128px App Icon 预览，以及 renderer 的 ActivityBar、欢迎页、neutral Logo 和文档首页。
4. 提交两个源 SVG、同步副本和所有发生变化的生成资产。

`icon:build` 使用 macOS `iconutil`。如果所有 iconset PNG 已成功生成，但受限环境中的
`iconutil` 单独报 `Invalid Iconset`，在获得本次构建的明确授权后，将相同命令申请在受限环境
外重跑；如果外部重跑仍失败，应按普通图标构建故障继续诊断。

## 验证

```bash
pnpm icon:check
pnpm exec vitest run --project main test/main/scripts/icon-assets.spec.mjs
pnpm exec vitest run --project renderer test/renderer/src/components/logo.spec.ts
```

完整平台图标验证需在 macOS 上运行已获授权的 `pnpm icon:build`，并确认：

- `resources/app-icon.png` 与 `build/icon.png` 为 512×512 RGBA PNG。
- `build/icon.icns` 可被 macOS 识别。
- `build/icon.ico` 包含 16–256px 尺寸。
- 连续运行两次不产生第二轮内容变化。

## 失效信号

- 当 `scripts/icon/assets.mjs`、`scripts/icon/build.mjs`、`electron-builder.yml`、
  `Logo.vue` 或图标文件路径发生变化时，重新检查本文档。
