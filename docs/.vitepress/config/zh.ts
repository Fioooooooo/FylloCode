import { createLocaleSidebar } from "./sidebar.mjs";

const releaseUrl = "https://github.com/Fioooooooo/FylloCode/releases";
const copyright = "Copyright © 2026 Fio";
const sidebar = createLocaleSidebar({
  localeDir: "zh",
  docsRoutePrefix: "/docs",
  blogRoutePrefix: "/blog",
  sortLocale: "zh-CN",
  fallbackGroupText: "未分组",
});

export const zh = {
  themeConfig: {
    nav: [
      { text: "文档", link: "/docs/" },
      { text: "博客", link: "/blog/" },
      { text: "下载", link: releaseUrl },
    ],

    sidebar,

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
      message: "基于 MIT 发布",
      copyright,
    },
  },
};
