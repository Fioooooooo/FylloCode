import { defineConfig } from "vitepress";

const github = "https://github.com/Fioooooooo/FylloCode";

const docsSidebar = [
  {
    text: "指南",
    items: [
      { text: "概览", link: "/guide/" },
      { text: "为什么需要 FylloCode", link: "/guide/why" },
      { text: "快速开始", link: "/guide/getting-started" },
      { text: "四阶段工作流", link: "/guide/workflow" },
      { text: "用 FylloCode 开发 FylloCode", link: "/guide/develop-with-fyllocode" },
    ],
  },
  {
    text: "产品功能",
    items: [
      { text: "功能总览", link: "/features/" },
      { text: "任务看板", link: "/features/task" },
      { text: "对话与执行", link: "/features/chat" },
      { text: "Proposal 评审", link: "/features/proposal" },
      { text: "Workflow 编排", link: "/features/workflow" },
      { text: "ACP Agents", link: "/features/agents" },
      { text: "研发系统集成", link: "/features/integrations" },
    ],
  },
  {
    text: "参考",
    items: [
      { text: "Workflow 配置", link: "/reference/workflow-config" },
      { text: "fyllo-specs MCP", link: "/reference/fyllo-specs" },
      { text: "fyllo-skills MCP", link: "/reference/fyllo-skills" },
      { text: "ACP Agent 分类", link: "/reference/acp-agent-kind" },
    ],
  },
  {
    text: "参与贡献",
    items: [{ text: "贡献指南", link: "/contributing" }],
  },
];

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
      { text: "文档", link: "/guide/" },
      { text: "博客", link: "/blog/" },
      { text: "下载", link: `${github}/releases` },
    ],

    sidebar: {
      "/guide/": docsSidebar,
      "/features/": docsSidebar,
      "/reference/": docsSidebar,
      "/contributing": docsSidebar,
      "/blog/": [
        {
          text: "博客",
          items: [{ text: "全部文章", link: "/blog/" }],
        },
      ],
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
});
