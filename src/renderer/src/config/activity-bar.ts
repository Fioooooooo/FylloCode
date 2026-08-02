export interface ActivityBarItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  group: "top" | "bottom";
  requiresWorkspace: boolean;
  isDefault?: boolean;
}

export const activityBarItems: readonly ActivityBarItem[] = [
  {
    id: "overview",
    icon: "i-lucide-layout-dashboard",
    label: "概览",
    path: "/overview",
    group: "top",
    requiresWorkspace: true,
    isDefault: true,
  },
  {
    id: "chat",
    icon: "i-lucide-message-circle-more",
    label: "对话",
    path: "/chat",
    group: "top",
    requiresWorkspace: true,
  },
  {
    id: "task",
    icon: "i-lucide-list-checks",
    label: "任务",
    path: "/task",
    group: "top",
    requiresWorkspace: true,
  },
  {
    id: "workflow",
    icon: "i-lucide-workflow",
    label: "工作流",
    path: "/workflow",
    group: "top",
    requiresWorkspace: true,
  },
  {
    id: "cron",
    icon: "i-lucide-calendar-days",
    label: "定时",
    path: "/cron",
    group: "top",
    requiresWorkspace: true,
  },
  {
    id: "integration",
    icon: "i-lucide-plug",
    label: "集成",
    path: "/integration",
    group: "top",
    requiresWorkspace: true,
  },
  {
    id: "setting",
    icon: "i-lucide-settings",
    label: "设置",
    path: "/settings",
    group: "bottom",
    requiresWorkspace: false,
  },
];

// 运行期断言：必须有且仅有一个默认 activity item，保证无工作区时始终有稳定的回落页面。
const defaults = activityBarItems.filter((i) => i.isDefault);

if (import.meta.env.DEV || import.meta.env.VITEST) {
  if (defaults.length !== 1) {
    throw new Error(
      `ActivityBar registry must declare exactly one default item, found ${defaults.length}`
    );
  }
}

export const defaultActivityBarItem = defaults[0];
