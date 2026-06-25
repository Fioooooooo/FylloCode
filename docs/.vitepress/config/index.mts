import { defineConfig } from "vitepress";
import { en } from "./en";
import { zh } from "./zh";
import { mermaidPlugin } from "../plugins/vitepress-mermaid/index";

const github = "https://github.com/Fioooooooo/FylloCode";

export default defineConfig({
  lang: "zh-CN",
  title: "FylloCode",
  description: "Coding Agent 的团队治理层",
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
      gtag('config', 'RJF11TQC36');`
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
