import { defineConfig } from "vitepress";
import { en } from "./en";
import { zh } from "./zh";
import { mermaidPlugin } from "../plugins/vitepress-mermaid/index";

const github = "https://github.com/Fioooooooo/FylloCode";
const hostname = "https://fyllocode.cc";
const ogImage = `${hostname}/assets/og.png`;

/** 站点级 description，`transformPageData` 在页面未声明 description 时按 locale 回退。 */
const localeDescriptions = {
  "zh-CN": "连接 Claude Code、Codex 等本地 Coding Agent 的开源项目工作台",
  "en-US": "An open-source project workspace for Claude Code, Codex, and other local Coding Agents.",
};

/** 把 srcDir 相对路径转成 `cleanUrls` 下的站点路径：`index.md` -> ``，`en/index.md` -> `en/`。 */
function toSitePath(relativePath: string): string {
  return relativePath.replace(/\.md$/, "").replace(/(^|\/)index$/, "$1");
}

export default defineConfig({
  lang: "zh-CN",
  title: "FylloCode",
  description: "连接 Claude Code、Codex 等本地 Coding Agent 的开源项目工作台",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/assets/fyllocode.svg" }],
    [
      "meta",
      {
        name: "google-site-verification",
        content: "A09uT7wAL7eRDOVvFOJJTgcyEw6Yqj98fCV9UtsZon8"
      }
    ],
    [
      "script",
      {
        async: "true",
        src: "https://www.googletagmanager.com/gtag/js?id=G-RJF11TQC36"
      }
    ],
    [
      "script",
      {},
      `window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-RJF11TQC36');`
    ],
    [
      "script",
      {
        defer: "true",
        src: "https://cloud.umami.is/script.js",
        "data-website-id": "77c179bb-0afd-4eb9-b1c7-f88f67a25ba1",
        "data-auto-track": "false",
        "data-exclude-hash": "true",
        "data-domains": "fyllocode.cc",
      },
    ],
  ],

  rewrites: {
    "zh/:rest*": ":rest*",
  },

  transformPageData(pageData) {
    const isEnglish = pageData.relativePath.startsWith("en/");
    const locale = isEnglish ? "en-US" : "zh-CN";
    const url = `${hostname}/${toSitePath(pageData.relativePath)}`;
    // 用 `||` 而非 `??`：VitePress 会把缺省的 title/description 填成空字符串，`??` 不会回退。
    const title = pageData.frontmatter.title || pageData.title || "FylloCode";
    const description =
      pageData.frontmatter.description || pageData.description || localeDescriptions[locale];

    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:site_name", content: "FylloCode" }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:image", content: ogImage }],
      ["meta", { property: "og:image:width", content: "1200" }],
      ["meta", { property: "og:image:height", content: "630" }],
      ["meta", { property: "og:locale", content: isEnglish ? "en_US" : "zh_CN" }],
      ["meta", { property: "og:locale:alternate", content: isEnglish ? "zh_CN" : "en_US" }],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }],
      ["meta", { name: "twitter:image", content: ogImage }],
    );
  },

  themeConfig: {
    logo: "/assets/fyllocode.svg",

    socialLinks: [{ icon: "github", link: github }],

    search: {
      provider: "local",
    },
  },

  sitemap: {
    hostname: "https://fyllocode.cc",
  },

  markdown: {
    config: (md) => {
      md.use(mermaidPlugin);
    },
  },

  locales: {
    root: { label: "简体中文", lang: "zh-CN", ...zh },
    en: { label: "English", lang: "en-US", ...en },
  },
});
