import { createLocaleSidebar } from "./sidebar.mjs";

const releaseUrl = "https://github.com/Fioooooooo/FylloCode/releases";
const copyright = "Copyright © 2026 Fio";
const sidebar = createLocaleSidebar({
  localeDir: "en",
  docsRoutePrefix: "/en/docs",
  blogRoutePrefix: "/en/blog",
  sortLocale: "en-US",
  fallbackGroupText: "Ungrouped",
});

export const en = {
  description: "The team governance layer for Coding Agents.",
  themeConfig: {
    nav: [
      { text: "Docs", link: "/en/docs/" },
      { text: "Blog", link: "/en/blog/" },
      { text: "Download", link: releaseUrl },
    ],

    sidebar,

    outline: {
      label: "On This Page",
      level: [2, 3],
    },

    docFooter: {
      prev: "Previous",
      next: "Next",
    },

    lastUpdated: {
      text: "Last Updated",
    },

    footer: {
      message: "Released under MIT",
      copyright,
    },
  },
};
