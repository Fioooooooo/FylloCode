export interface ActivityBarItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  group: "top" | "bottom";
  requiresProject: boolean;
  isDefault?: boolean;
}

export const activityBarItems: readonly ActivityBarItem[] = [
  {
    id: "chat",
    icon: "i-lucide-message-circle-more",
    label: "对话",
    path: "/chat",
    group: "top",
    requiresProject: true,
    isDefault: true,
  },
  {
    id: "proposal",
    icon: "i-lucide-file-pen",
    label: "提案",
    path: "/proposal",
    group: "top",
    requiresProject: true,
  },
  {
    id: "task",
    icon: "i-lucide-list-checks",
    label: "任务",
    path: "/task",
    group: "top",
    requiresProject: true,
  },
  {
    id: "workflow",
    icon: "i-lucide-workflow",
    label: "工作流",
    path: "/workflow",
    group: "top",
    requiresProject: true,
  },
  {
    id: "cron",
    icon: "i-lucide-calendar-days",
    label: "定时",
    path: "/cron",
    group: "top",
    requiresProject: true,
  },
  {
    id: "integration",
    icon: "i-lucide-plug",
    label: "集成",
    path: "/integration",
    group: "top",
    requiresProject: true,
  },
  {
    id: "setting",
    icon: "i-lucide-settings",
    label: "设置",
    path: "/settings",
    group: "bottom",
    requiresProject: false,
  },
];

const defaults = activityBarItems.filter((i) => i.isDefault);

if (import.meta.env.DEV || import.meta.env.VITEST) {
  if (defaults.length !== 1) {
    throw new Error(
      `ActivityBar registry must declare exactly one default item, found ${defaults.length}`
    );
  }
}

export const defaultActivityBarItem = defaults[0];
