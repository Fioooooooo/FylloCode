// 只识别文件开头完整的 YAML frontmatter 边界；内容字段由 Markdown renderer 原样展示，
// 不在 renderer 中解析或重组，以兼容数量不固定的 anchors 和扩展字段。
const FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/;

function fenceFor(content: string): string {
  const longestBacktickRun = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longestBacktickRun + 1));
}

export function prepareKnowledgeMarkdownForDisplay(content: string): string {
  const frontmatter = FRONTMATTER_PATTERN.exec(content)?.[0];
  if (!frontmatter) {
    return content;
  }

  const fence = fenceFor(frontmatter);
  return `${fence}yaml\n${frontmatter}\n${fence}${content.slice(frontmatter.length)}`;
}
