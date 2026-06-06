export function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  if (diff < 30 * day) return `${Math.max(1, Math.floor(diff / day))} 天前`;

  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}
