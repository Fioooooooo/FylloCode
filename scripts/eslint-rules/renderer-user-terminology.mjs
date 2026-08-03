const ignoredVueAttributes = new Set([
  "class",
  "color",
  "data-testid",
  "href",
  "icon",
  "id",
  "key",
  "name",
  "role",
  "size",
  "style",
  "to",
  "type",
  "variant",
]);

// 只匹配作为文案出现的内部英文类型名；lowercase enum 和代码 identifier 不在匹配范围内。
const internalUserTermPattern = /\b(?:Folder Workspace|Collection Workspace|Folder|Collection)\b/u;

function internalUserTerm(value) {
  if (typeof value !== "string") {
    return null;
  }

  return value.match(internalUserTermPattern)?.[0] ?? null;
}

function isModuleSpecifier(node) {
  return (
    node.parent?.type === "ImportDeclaration" ||
    node.parent?.type === "ExportNamedDeclaration" ||
    node.parent?.type === "ExportAllDeclaration" ||
    node.parent?.type === "ImportExpression"
  );
}

function isPropertyKey(node) {
  return (
    (node.parent?.type === "Property" ||
      node.parent?.type === "PropertyDefinition" ||
      node.parent?.type === "MethodDefinition") &&
    node.parent.key === node
  );
}

function vueAttributeName(node) {
  if (node.directive || node.key?.type !== "VIdentifier") {
    return null;
  }

  return node.key.name;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Prevent internal Workspace model terms from becoming renderer user copy.",
    },
    schema: [],
    messages: {
      internalUserTerm:
        'Do not expose internal term "{{term}}" in user copy; use the Project/Workspace presentation mapping or neutral wording.',
    },
  },
  create(context) {
    function reportValue(node, value) {
      const term = internalUserTerm(value);
      if (term) {
        context.report({ node, messageId: "internalUserTerm", data: { term } });
      }
    }

    const scriptVisitor = {
      Literal(node) {
        if (isModuleSpecifier(node) || isPropertyKey(node)) {
          return;
        }
        reportValue(node, node.value);
      },
      TemplateElement(node) {
        reportValue(node, node.value.cooked ?? node.value.raw);
      },
      JSXText(node) {
        reportValue(node, node.value);
      },
    };

    const templateVisitor = {
      VText(node) {
        reportValue(node, node.value);
      },
      VAttribute(node) {
        const name = vueAttributeName(node);
        if (!name || name.startsWith("data-") || ignoredVueAttributes.has(name)) {
          return;
        }
        reportValue(node, node.value?.value);
      },
    };

    const services = context.sourceCode.parserServices;
    if (services?.defineTemplateBodyVisitor) {
      return services.defineTemplateBodyVisitor(templateVisitor, scriptVisitor);
    }

    return scriptVisitor;
  },
};
