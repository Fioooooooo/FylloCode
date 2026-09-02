/**
 * Workflow 模板变量插值
 *
 * 根据 definition-schema.md 第 8 节，支持以下命名空间：
 * - run.*: 始终可用
 * - artifacts.*: 对应 stage 已产出时可用
 * - task/proposal/plan: 需要 requires 声明（Phase 1 不支持）
 *
 * Phase 1 约束：requires 为空，只支持 run.* 引用
 */

export interface InterpolationContext {
  run: {
    id: string;
    startedAt: string;
  };
  artifacts?: Record<string, unknown>;
}

/**
 * 插值模板字符串中的变量引用
 *
 * 模板格式: {{namespace.path}}
 * 例如: {{run.id}}, {{artifacts.code}}
 *
 * @param template 包含模板变量的字符串
 * @param context 插值上下文
 * @returns 插值后的字符串
 */
export function interpolateTemplate(template: string, context: InterpolationContext): string {
  // 匹配 {{namespace.path}} 或 {{namespace.path | filter}}
  // 正则与 yaml-parser.ts collectTemplateReferences 保持一致
  const pattern = /\{\{\s*([A-Za-z][A-Za-z0-9_-]*)\.([^}|\s]+)(?:\s*\|[^}]*)?\s*\}\}/g;

  return template.replace(pattern, (match, namespace, path) => {
    // 获取命名空间的值
    const namespaceValue = context[namespace as keyof InterpolationContext];

    if (!namespaceValue || typeof namespaceValue !== "object") {
      // 命名空间不存在，保持原样
      // validation 已在 yaml-parser 中完成，这里不应该出现非法引用
      return match;
    }

    // 解析嵌套路径，例如 run.id 或 artifacts.code.value
    const keys = path.split(".");
    let current: unknown = namespaceValue;

    for (const key of keys) {
      if (current && typeof current === "object" && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        // 路径不存在，保持原样
        return match;
      }
    }

    // 转换为字符串
    if (current === null || current === undefined) {
      return "";
    }

    if (
      typeof current === "string" ||
      typeof current === "number" ||
      typeof current === "boolean"
    ) {
      return String(current);
    }

    // 复杂对象保持原样（不应该出现在合法的模板中）
    return match;
  });
}
