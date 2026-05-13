import type { IntegrationCategory, ProviderManifest } from "@shared/types/integration";

export const integrationCategories: IntegrationCategory[] = [
  {
    id: "project-management",
    name: "项目管理",
    description: "任务与需求的来源和归宿",
  },
  {
    id: "source-control",
    name: "源码管理",
    description: "代码的版本管理",
  },
  {
    id: "ci-cd",
    name: "CI/CD",
    description: "构建、测试与交付",
  },
  {
    id: "deployment",
    name: "部署",
    description: "应用部署目标",
  },
  {
    id: "communication",
    name: "通讯",
    description: "通知与协作",
  },
  {
    id: "observability",
    name: "可观测性",
    description: "监控、日志与告警",
  },
];

export const providers: ProviderManifest[] = [
  {
    id: "yunxiao",
    name: "云效",
    description: "统一覆盖 Projex、Codeup 与 Flow 的研发平台。",
    authType: "api-token",
    credentialFields: [
      {
        key: "x-yunxiao-token",
        label: "个人访问令牌",
        type: "password",
        placeholder: "请输入云效个人访问令牌",
        helperText: "在云效个人设置中生成 Personal Access Token。",
        helpLink:
          "https://help.aliyun.com/zh/yunxiao/developer-reference/obtain-personal-access-token",
        required: true,
      },
    ],
    capabilities: [
      {
        stage: "project-management",
        resourceType: "projex-project",
        label: "Projex 项目",
        description: "任务与需求来源。",
      },
      {
        stage: "source-control",
        resourceType: "codeup-repo",
        label: "Codeup 仓库",
        description: "代码仓库与合并请求。",
      },
      {
        stage: "ci-cd",
        resourceType: "flow-pipeline",
        label: "Flow 流水线",
        description: "构建、测试与交付流水线。",
      },
    ],
    logoIcon: "i-lucide-layers-3",
    logoColor: "text-primary",
    comingSoon: false,
  },
  {
    id: "github",
    name: "GitHub",
    description: "统一覆盖 GitHub Issues、仓库与 Actions。",
    authType: "oauth",
    credentialFields: [],
    capabilities: [
      {
        stage: "project-management",
        resourceType: "github-issue",
        label: "Issues 源",
        description: "仓库内 issue 与任务来源。",
      },
      {
        stage: "source-control",
        resourceType: "github-repo",
        label: "GitHub 仓库",
        description: "代码仓库与 Pull Request。",
      },
      {
        stage: "ci-cd",
        resourceType: "github-workflow",
        label: "GitHub Actions",
        description: "工作流与自动化流水线。",
      },
    ],
    logoIcon: "i-lucide-github",
    logoColor: "text-highlighted",
    comingSoon: true,
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "统一覆盖 GitLab 仓库与 CI/CD。",
    authType: "oauth",
    credentialFields: [],
    capabilities: [
      {
        stage: "source-control",
        resourceType: "gitlab-repo",
        label: "GitLab 仓库",
        description: "代码仓库与 Merge Request。",
      },
      {
        stage: "ci-cd",
        resourceType: "gitlab-pipeline",
        label: "GitLab CI",
        description: "内置 CI/CD 流水线。",
      },
    ],
    logoIcon: "i-lucide-gitlab",
    logoColor: "text-error",
    comingSoon: true,
  },
  {
    id: "jira",
    name: "Jira",
    description: "项目与问题跟踪平台。",
    authType: "oauth",
    credentialFields: [],
    capabilities: [
      {
        stage: "project-management",
        resourceType: "jira-project",
        label: "Jira 项目",
        description: "工作项与项目跟踪。",
      },
    ],
    logoIcon: "i-lucide-ticket",
    logoColor: "text-warning",
    comingSoon: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "简洁的问题跟踪与项目协作。",
    authType: "oauth",
    credentialFields: [],
    capabilities: [
      {
        stage: "project-management",
        resourceType: "linear-team",
        label: "Linear 团队",
        description: "问题跟踪与计划管理。",
      },
    ],
    logoIcon: "i-lucide-list-checks",
    logoColor: "text-secondary",
    comingSoon: true,
  },
  {
    id: "aliyun",
    name: "阿里云",
    description: "统一覆盖部署与日志观测能力。",
    authType: "api-token",
    credentialFields: [
      {
        key: "accessKey",
        label: "Access Key",
        type: "text",
        placeholder: "请输入阿里云 Access Key",
        helperText: "在阿里云控制台 RAM 访问控制中获取。",
        helpLink: "https://ram.console.aliyun.com/manage/ak",
        required: true,
      },
      {
        key: "accessSecret",
        label: "Access Secret",
        type: "password",
        placeholder: "请输入阿里云 Access Secret",
        helperText: "请使用具备目标资源读取权限的 Access Secret。",
        helpLink: "https://ram.console.aliyun.com/manage/ak",
        required: true,
      },
    ],
    capabilities: [
      {
        stage: "deployment",
        resourceType: "aliyun-service",
        label: "部署服务",
        description: "ECS、SAE 或函数计算目标。",
      },
      {
        stage: "observability",
        resourceType: "sls-logstore",
        label: "SLS Logstore",
        description: "日志查询与告警分析。",
      },
    ],
    logoIcon: "i-lucide-cloud",
    logoColor: "text-primary",
    comingSoon: false,
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "前端应用部署平台。",
    authType: "oauth",
    credentialFields: [],
    capabilities: [
      {
        stage: "deployment",
        resourceType: "vercel-project",
        label: "Vercel 项目",
        description: "站点与部署环境。",
      },
    ],
    logoIcon: "i-lucide-triangle",
    logoColor: "text-highlighted",
    comingSoon: true,
  },
  {
    id: "dingtalk",
    name: "钉钉",
    description: "企业内通知与协作。",
    authType: "api-token",
    credentialFields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        type: "url",
        placeholder: "https://oapi.dingtalk.com/robot/send?access_token=...",
        helperText: "在钉钉群机器人设置中获取 Webhook 地址。",
        helpLink: "https://open.dingtalk.com/document/robots/custom-robot-access",
        required: true,
      },
      {
        key: "secret",
        label: "Secret",
        type: "password",
        placeholder: "签名密钥（如启用加签）",
        helperText: "仅在启用加签安全设置时需要填写。",
        helpLink: "https://open.dingtalk.com/document/robots/customize-robot-security-settings",
        required: false,
      },
    ],
    capabilities: [
      {
        stage: "communication",
        resourceType: "dingtalk-robot",
        label: "钉钉机器人",
        description: "消息通知与审批提醒。",
      },
    ],
    logoIcon: "i-lucide-message-circle",
    logoColor: "text-info",
    comingSoon: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "团队消息与通知。",
    authType: "oauth",
    credentialFields: [],
    capabilities: [
      {
        stage: "communication",
        resourceType: "slack-channel",
        label: "Slack Channel",
        description: "消息通知与协作频道。",
      },
    ],
    logoIcon: "i-lucide-hash",
    logoColor: "text-secondary",
    comingSoon: true,
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "错误追踪与性能监控。",
    authType: "oauth",
    credentialFields: [],
    capabilities: [
      {
        stage: "observability",
        resourceType: "sentry-project",
        label: "Sentry 项目",
        description: "错误监控与问题跟踪。",
      },
    ],
    logoIcon: "i-lucide-bug",
    logoColor: "text-error",
    comingSoon: true,
  },
];

export const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
