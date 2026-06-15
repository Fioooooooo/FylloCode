import { defineConfig } from "vitepress";

const github = "https://github.com/Fioooooooo/FylloCode";

const docsSidebar = [
  {
    text: "指南",
    items: [
      { text: "概览", link: "/docs/" },
      { text: "为什么需要 FylloCode", link: "/docs/guide/why" },
      { text: "快速开始", link: "/docs/guide/getting-started" },
      { text: "四阶段工作流", link: "/docs/guide/workflow" },
      { text: "Lineage 追溯链路", link: "/docs/guide/lineage" },
    ],
  },
  {
    text: "产品功能",
    items: [
      { text: "功能总览", link: "/docs/features/" },
      { text: "项目概览", link: "/docs/features/overview" },
      { text: "任务看板", link: "/docs/features/task" },
      { text: "对话与执行", link: "/docs/features/chat" },
      { text: "Proposal 评审", link: "/docs/features/proposal" },
      { text: "Workflow 编排", link: "/docs/features/workflow" },
      { text: "ACP Agents", link: "/docs/features/agents" },
      { text: "研发系统集成", link: "/docs/features/integrations" },
    ],
  },
  {
    text: "参考",
    items: [
      { text: "Workflow 配置", link: "/docs/reference/workflow-config" },
      { text: "fyllo-specs MCP", link: "/docs/reference/fyllo-specs" },
      { text: "fyllo-skills MCP", link: "/docs/reference/fyllo-skills" },
      { text: "ACP Agent 分类", link: "/docs/reference/acp-agent-kind" },
    ],
  },
  {
    text: "参与贡献",
    items: [
      { text: "贡献指南", link: "/docs/contributing" },
      { text: "用 FylloCode 开发 FylloCode", link: "/docs/guide/develop-with-fyllocode" },
    ],
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
      { text: "文档", link: "/docs/" },
      { text: "博客", link: "/blog/" },
      { text: "下载", link: `${github}/releases` },
    ],

    sidebar: {
      "/docs/": docsSidebar,
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
