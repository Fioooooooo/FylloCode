import path from "node:path";

const rendererSourceMarker = "src/renderer/src/";
const featureSourceMarker = `${rendererSourceMarker}features/`;
const featureAliasPrefix = "@renderer/features/";
const featureLayers = new Set(["model", "application", "ui", "integration"]);

const allowedSameFeatureDependencies = {
  model: new Set(["model"]),
  application: new Set(["model", "application"]),
  ui: new Set(["model", "application", "ui"]),
  integration: new Set(["model", "application", "ui", "integration"]),
};

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

/**
 * 按 features/<feature>/<layer> 语义解析路径；未知第二段保留为 feature 根文件，
 * 避免把小型平铺 feature 误判为四层结构。
 */
function parseFeaturePath(filePath) {
  const normalized = normalizePath(filePath);
  const markerIndex = normalized.lastIndexOf(featureSourceMarker);
  if (markerIndex < 0) {
    return null;
  }

  const segments = normalized.slice(markerIndex + featureSourceMarker.length).split("/");
  const feature = segments[0];
  if (!feature) {
    return null;
  }

  const layer = featureLayers.has(segments[1]) ? segments[1] : null;
  return { feature, layer, segments };
}

function resolveRendererImport(importSource, filename) {
  if (importSource === "@renderer") {
    return rendererSourceMarker.slice(0, -1);
  }

  if (importSource.startsWith("@renderer/")) {
    return `${rendererSourceMarker}${importSource.slice("@renderer/".length)}`;
  }

  if (!importSource.startsWith(".")) {
    return null;
  }

  return path.posix.normalize(
    path.posix.join(path.posix.dirname(normalizePath(filename)), importSource)
  );
}

function parseFeatureImport(importSource, filename) {
  const resolved = resolveRendererImport(importSource, filename);
  if (!resolved) {
    return null;
  }

  const target = parseFeaturePath(resolved);
  if (!target) {
    return null;
  }

  const viaFeatureAlias = importSource.startsWith(featureAliasPrefix);
  const aliasSegments = viaFeatureAlias
    ? importSource.slice(featureAliasPrefix.length).split("/")
    : [];
  const publicEntry =
    aliasSegments.length === 1
      ? "root"
      : aliasSegments.length === 2 && aliasSegments[1] === "integration"
        ? "integration"
        : null;

  return { ...target, viaFeatureAlias, publicEntry };
}

function isFeaturePublicIndex(sourceInfo) {
  if (!sourceInfo) {
    return false;
  }

  const relativeSegments = sourceInfo.segments.slice(1);
  return (
    (relativeSegments.length === 1 && /^index\.[cm]?[jt]sx?$/.test(relativeSegments[0])) ||
    (relativeSegments.length === 2 &&
      relativeSegments[0] === "integration" &&
      /^index\.[cm]?[jt]sx?$/.test(relativeSegments[1]))
  );
}

function isVueSfcImport(importSource) {
  return /\.vue(?:[?#]|$)/.test(importSource);
}

function isModelFrameworkImport(importSource) {
  return /^(?:vue(?:\/|$)|pinia$|@vueuse\/|@nuxt\/ui(?:\/|$)|electron(?:\/|$)|@renderer(?:\/|$))/.test(
    importSource
  );
}

/**
 * 别名形式（@renderer/...）由前缀正则拦截；此处解析相对路径，
 * 拦截解析后落在 renderer 源码内但位于 features/ 之外的 infrastructure 导入。
 */
function isRendererInfrastructureImport(importSource, filename) {
  const resolved = resolveRendererImport(importSource, filename);
  if (!resolved) {
    return false;
  }

  const normalized = normalizePath(resolved);
  if (normalized.lastIndexOf(rendererSourceMarker) < 0) {
    return false;
  }

  return parseFeaturePath(normalized) === null;
}

function isRendererAreaImport(importSource, filename, area) {
  const resolved = resolveRendererImport(importSource, filename);
  if (!resolved) {
    return false;
  }

  const normalized = normalizePath(resolved);
  const markerIndex = normalized.lastIndexOf(rendererSourceMarker);
  if (markerIndex < 0) {
    return false;
  }

  return normalized.slice(markerIndex + rendererSourceMarker.length).startsWith(`${area}/`);
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce generic renderer feature public APIs and semantic layer boundaries.",
    },
    schema: [],
    messages: {
      applicationUiDependency:
        "Feature application modules must not import Vue SFCs, renderer components, ui/, or integration/; use application ports and host composition.",
      crossFeatureDependency:
        "Feature model/application modules must not depend on another feature; define a consumer-owned port and bind it in integration/host code.",
      deepFeatureImport:
        "Import another feature through @renderer/features/<feature> or the standard /integration entry, not an internal or relative path.",
      integrationFromUi:
        "Feature UI must not import another feature's integration entry; compose integrations in integration/host code.",
      invalidLayerDependency:
        "Invalid same-feature dependency from {{sourceLayer}}/ to {{targetLayer}}/; dependencies must point inward.",
      modelDependency:
        "Feature model modules must stay pure and cannot import Vue/Pinia/Electron, renderer infrastructure, Vue SFCs, or other feature layers.",
      selfPublicImport:
        "Modules inside a feature must use relative imports for their own internals, not the feature public API.",
      uiApiDependency:
        "Feature UI must not import renderer API wrappers directly; route side effects through application code.",
      wildcardPublicApi:
        "Feature public entry points must explicitly export stable symbols; export * is forbidden.",
    },
  },
  create(context) {
    const filename = context.physicalFilename || context.filename;
    const sourceInfo = parseFeaturePath(filename);

    function report(node, messageId, data) {
      context.report({ node, messageId, data });
    }

    function checkLayerInfrastructure(node, importSource) {
      if (!sourceInfo?.layer) {
        return false;
      }

      if (
        sourceInfo.layer === "model" &&
        (isModelFrameworkImport(importSource) ||
          isVueSfcImport(importSource) ||
          isRendererInfrastructureImport(importSource, filename))
      ) {
        report(node, "modelDependency");
        return true;
      }

      if (
        sourceInfo.layer === "application" &&
        (isVueSfcImport(importSource) || isRendererAreaImport(importSource, filename, "components"))
      ) {
        report(node, "applicationUiDependency");
        return true;
      }

      if (sourceInfo.layer === "ui" && isRendererAreaImport(importSource, filename, "api")) {
        report(node, "uiApiDependency");
        return true;
      }

      return false;
    }

    function checkFeatureBoundary(node, importSource) {
      const targetInfo = parseFeatureImport(importSource, filename);
      if (!targetInfo) {
        return;
      }

      if (!sourceInfo) {
        if (!targetInfo.viaFeatureAlias || !targetInfo.publicEntry) {
          report(node, "deepFeatureImport");
        }
        return;
      }

      if (targetInfo.feature === sourceInfo.feature) {
        if (targetInfo.viaFeatureAlias) {
          report(node, "selfPublicImport");
          return;
        }

        if (
          sourceInfo.layer &&
          targetInfo.layer &&
          !allowedSameFeatureDependencies[sourceInfo.layer].has(targetInfo.layer)
        ) {
          report(node, "invalidLayerDependency", {
            sourceLayer: sourceInfo.layer,
            targetLayer: targetInfo.layer,
          });
        }
        return;
      }

      if (!targetInfo.viaFeatureAlias || !targetInfo.publicEntry) {
        report(node, "deepFeatureImport");
        return;
      }

      if (sourceInfo.layer === "model" || sourceInfo.layer === "application") {
        report(node, "crossFeatureDependency");
        return;
      }

      if (sourceInfo.layer === "ui" && targetInfo.publicEntry === "integration") {
        report(node, "integrationFromUi");
      }
    }

    function checkImportSource(node) {
      const importSource = node.source?.value;
      if (typeof importSource !== "string") {
        return;
      }

      checkLayerInfrastructure(node.source, importSource);
      checkFeatureBoundary(node.source, importSource);
    }

    return {
      ImportDeclaration: checkImportSource,
      ExportNamedDeclaration: checkImportSource,
      ExportAllDeclaration(node) {
        if (isFeaturePublicIndex(sourceInfo)) {
          report(node, "wildcardPublicApi");
        }
        checkImportSource(node);
      },
      ImportExpression: checkImportSource,
    };
  },
};
