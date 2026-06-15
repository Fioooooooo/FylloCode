import { defineConfig } from "vitepress";
import { docsSidebar, blogSidebar } from "./sidebar.mjs";
import { mermaidPlugin } from "./plugins/vitepress-mermaid";

const github = "https://github.com/Fioooooooo/FylloCode";

export default defineConfig({
  lang: "zh-CN",
  title: "FylloCode",
  description: "Coding Agent 的团队治理层",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/assets/icon.svg" }],
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
  themeConfig: {
    logo: "/assets/icon.svg",

    nav: [
      { text: "文档", link: "/docs/" },
      { text: "博客", link: "/blog/" },
      { text: "下载", link: `${github}/releases` },
    ],

    sidebar: {
      "/docs/": docsSidebar,
      "/blog/": blogSidebar,
    },

    socialLinks: [{ icon: "github", link: github }],

    search: {
      provider: "local",
    },

    outline: {
      label: "本页目录",
      level: [2, 3],
    },

    docFooter: {
      prev: "上一页",
      next: "下一页",
    },

    lastUpdated: {
      text: "最后更新",
    },

    footer: {
      message: "基于 AGPL-3.0 发布",
      copyright: "Copyright © 2026 FylloCode",
    },
  },
  markdown: {
    config: (md) => {
      md.use(mermaidPlugin);
    },
  },
});
