import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import type { DefaultTheme } from "vitepress";

const siteRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

type SidebarSource = {
  /**
   * Sidebar 分组名称，仅 `createGroupedSidebar` 使用；同名页面会归入同一组。
   *
   * 用法：文档页写 `sidebar.group`，如 `group: 产品功能`。
   * 示例：
   * ```yaml
   * sidebar:
   *   group: 产品功能
   * ```
   */
  group?: string;
  /**
   * Sidebar 分组排序，仅 `createGroupedSidebar` 使用；数字越小，分组越靠前。
   *
   * 用法：通常只在每个分组的入口页声明一次，组内其它页面可以省略。
   * 示例：
   * ```yaml
   * sidebar:
   *   group: 产品功能
   *   groupOrder: 20
   * ```
   */
  groupOrder?: number;
  /**
   * 是否从 sidebar 中隐藏当前页面；`sidebar: false` 会被转换成 `hidden: true`。
   *
   * 用法：适合草稿页、落地页或不希望出现在导航中的页面。
   * 示例：
   * ```yaml
   * sidebar:
   *   hidden: true
   * ```
   */
  hidden?: boolean;
  /**
   * 页面在当前分组或扁平列表中的排序；数字越小，页面越靠前。
   *
   * 用法：文档分组内按 `order` 排序，博客列表也按 `order` 排序。
   * 示例：
   * ```yaml
   * sidebar:
   *   order: 30
   * ```
   */
  order?: number;
  /**
   * 页面在 sidebar 中显示的标题；省略时依次回退到 frontmatter `title` 和 Markdown H1。
   *
   * 用法：当页面 H1 较长，或入口页需要显示为“概览”“全部文章”时声明。
   * 示例：
   * ```yaml
   * sidebar:
   *   text: 概览
   * ```
   */
  text?: string;
};

type LocaleSidebarOptions = {
  blogRoutePrefix: string;
  docsRoutePrefix: string;
  fallbackGroupText: string;
  localeDir: string;
  sortLocale: string;
};

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function listMarkdownFiles(rootDir: string, dir = "."): string[] {
  const currentDir = join(rootDir, dir);

  if (!existsSync(currentDir)) {
    return [];
  }

  return readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = normalizePath(dir === "." ? entry.name : join(dir, entry.name));

    if (entry.isDirectory()) {
      return listMarkdownFiles(rootDir, relativePath);
    }

    return entry.isFile() && entry.name.endsWith(".md") ? [relativePath] : [];
  });
}

function readPage(filePath: string): SidebarSource & { text: string } {
  const markdown = readFileSync(filePath, "utf8");
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  const content = frontmatter ? markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "") : markdown;
  const data = parseFrontmatter(frontmatter);
  const sidebar = readSidebarSource(data);
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = readString(data, "title");

  return {
    ...sidebar,
    text: sidebar.text ?? title ?? h1 ?? "Untitled",
  };
}

function parseFrontmatter(frontmatter: string | undefined): Record<string, unknown> {
  if (frontmatter === undefined) {
    return {};
  }

  const data = load(frontmatter);
  return isRecord(data) ? data : {};
}

function readSidebarSource(frontmatter: Record<string, unknown>): SidebarSource {
  const sidebar = frontmatter.sidebar;

  if (sidebar === false) {
    return { hidden: true };
  }

  if (!isRecord(sidebar)) {
    return {};
  }

  return {
    group: readString(sidebar, "group"),
    groupOrder: readNumber(sidebar, "groupOrder"),
    hidden: readBoolean(sidebar, "hidden"),
    order: readNumber(sidebar, "order"),
    text: readString(sidebar, "text"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

function createFlatSidebar(rootDir: string, routePrefix: string, sortLocale: string): DefaultTheme.SidebarItem[] {
  return listMarkdownFiles(rootDir)
    .map((path) => {
      const page = readPage(join(rootDir, path));
      return {
        hidden: page.hidden,
        order: page.order ?? Number.POSITIVE_INFINITY,
        path,
        text: page.text,
      };
    })
    .filter((page) => !page.hidden)
    .sort((first, second) => first.order - second.order || first.text.localeCompare(second.text, sortLocale))
    .map(({ path, text }) => ({
      text,
      link: createSidebarLink(routePrefix, path),
    }));
}

function createGroupedSidebar(
  rootDir: string,
  routePrefix: string,
  sortLocale: string,
  fallbackGroupText: string,
): DefaultTheme.SidebarItem[] {
  const groups = new Map<string, { groupOrder: number; items: Array<DefaultTheme.SidebarItem & { order: number }> }>();

  for (const path of listMarkdownFiles(rootDir)) {
    const page = readPage(join(rootDir, path));

    if (page.hidden) {
      continue;
    }

    const groupText = page.group ?? fallbackGroupText;
    const group = groups.get(groupText) ?? { groupOrder: Number.POSITIVE_INFINITY, items: [] };
    group.groupOrder = Math.min(group.groupOrder, page.groupOrder ?? Number.POSITIVE_INFINITY);
    group.items.push({
      text: page.text,
      link: createSidebarLink(routePrefix, path),
      order: page.order ?? Number.POSITIVE_INFINITY,
    });
    groups.set(groupText, group);
  }

  return [...groups]
    .sort(
      ([firstText, first], [secondText, second]) =>
        first.groupOrder - second.groupOrder || firstText.localeCompare(secondText, sortLocale),
    )
    .map(([text, group]) => ({
      text,
      items: group.items
        .sort((first, second) => first.order - second.order || first.text.localeCompare(second.text, sortLocale))
        .map(({ order: _order, ...item }) => item),
    }));
}

function createSidebarLink(routePrefix: string, path: string): string {
  const prefix = routePrefix.replace(/\/$/, "");
  const slug = normalizePath(path).replace(/\.md$/, "").replace(/(^|\/)index$/, "$1");

  return slug.length === 0 ? `${prefix}/` : `${prefix}/${slug}`;
}

function createSidebarKey(routePrefix: string): string {
  return `${routePrefix.replace(/\/$/, "")}/`;
}

export function createLocaleSidebar(options: LocaleSidebarOptions): DefaultTheme.Sidebar {
  const localeRoot = join(siteRoot, options.localeDir);
  const docsRoot = join(localeRoot, "docs");
  const blogRoot = join(localeRoot, "blog");

  return {
    [createSidebarKey(options.docsRoutePrefix)]: createGroupedSidebar(
      docsRoot,
      options.docsRoutePrefix,
      options.sortLocale,
      options.fallbackGroupText,
    ),
    [createSidebarKey(options.blogRoutePrefix)]: createFlatSidebar(
      blogRoot,
      options.blogRoutePrefix,
      options.sortLocale,
    ),
  };
}
