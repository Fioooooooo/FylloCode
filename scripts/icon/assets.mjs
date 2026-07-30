/**
 * 同步并校验品牌图标的单一来源：`pnpm icon:check` 用它检测副本漂移，
 * `pnpm icon:build` 在生成平台图标前用它刷新 app、renderer 和 docs 资产。
 */
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRelativePath = "resources/icon.svg";
const appIconRelativePath = "resources/app-icon.svg";
const generatedRelativePaths = ["src/renderer/public/icon.svg", "docs/public/assets/fyllocode.svg"];

function resolveIconAssetPaths(rootDir) {
  return {
    sourcePath: join(rootDir, sourceRelativePath),
    appIconPath: join(rootDir, appIconRelativePath),
    generatedPaths: generatedRelativePaths.map((path) => join(rootDir, path)),
  };
}

function validatePureIcon(source) {
  const forbiddenElements = ["filter", "feDropShadow", "rect"];

  for (const element of forbiddenElements) {
    if (new RegExp(`<${element}\\b`, "i").test(source)) {
      throw new Error(`${sourceRelativePath} 必须是纯图标，不能包含 <${element}>`);
    }
  }

  const pathCount = source.match(/<path\b/gi)?.length ?? 0;
  if (pathCount !== 3) {
    throw new Error(`${sourceRelativePath} 应包含 3 条品牌路径，当前为 ${pathCount} 条`);
  }
}

function findAppIconImage(source) {
  if (/<path\b/i.test(source)) {
    throw new Error(`${appIconRelativePath} 不能复制品牌路径，应内嵌由 icon.svg 生成的图像`);
  }

  const image = source.match(/<image\b[^>]*\bdata-icon-source=(["'])icon\.svg\1[^>]*\/?>/i)?.[0];
  if (!image) {
    throw new Error(`${appIconRelativePath} 缺少 data-icon-source="icon.svg" 的 <image>`);
  }

  if (!/\bhref=(["'])[^"']*\1/i.test(image)) {
    throw new Error(`${appIconRelativePath} 的品牌 <image> 缺少 href`);
  }

  return image;
}

function embedPureIcon(appIcon, source) {
  const image = findAppIconImage(appIcon);
  const dataUri = `data:image/svg+xml;base64,${source.toString("base64")}`;
  const embeddedImage = image.replace(/\bhref=(["'])[^"']*\1/i, `href="${dataUri}"`);

  return appIcon.replace(image, embeddedImage);
}

async function readRequiredFile(path, label) {
  try {
    return await readFile(path);
  } catch (error) {
    throw new Error(`缺少图标文件：${label}`, { cause: error });
  }
}

async function writeIfChanged(path, content) {
  let current = null;

  try {
    current = await readFile(path);
  } catch {
    // 目标缺失时由同步流程创建。
  }

  if (current?.equals(content)) {
    return false;
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return true;
}

export async function validateIconSources(rootDir = process.cwd()) {
  const paths = resolveIconAssetPaths(rootDir);
  const [source, appIcon] = await Promise.all([
    readRequiredFile(paths.sourcePath, sourceRelativePath),
    readRequiredFile(paths.appIconPath, appIconRelativePath),
  ]);

  validatePureIcon(source.toString("utf8"));
  const appIconSource = appIcon.toString("utf8");
  const expectedAppIcon = embedPureIcon(appIconSource, source);
  if (expectedAppIcon !== appIconSource) {
    throw new Error(`${appIconRelativePath} 内嵌的 icon.svg 未同步，请运行 pnpm icon:build`);
  }

  return { ...paths, source, appIcon };
}

export async function syncIconAssets(rootDir = process.cwd()) {
  const paths = resolveIconAssetPaths(rootDir);
  const [source, appIcon] = await Promise.all([
    readRequiredFile(paths.sourcePath, sourceRelativePath),
    readRequiredFile(paths.appIconPath, appIconRelativePath),
  ]);

  validatePureIcon(source.toString("utf8"));
  const synchronizedAppIcon = Buffer.from(embedPureIcon(appIcon.toString("utf8"), source));
  const changed = [];

  if (await writeIfChanged(paths.appIconPath, synchronizedAppIcon)) {
    changed.push(paths.appIconPath);
  }

  for (const path of paths.generatedPaths) {
    if (await writeIfChanged(path, source)) {
      changed.push(path);
    }
  }

  return changed;
}

export async function checkIconAssets(rootDir = process.cwd()) {
  const { source, generatedPaths } = await validateIconSources(rootDir);
  const drifted = [];

  for (const path of generatedPaths) {
    try {
      await access(path, constants.R_OK);
      const generated = await readFile(path);
      if (!generated.equals(source)) {
        drifted.push(path);
      }
    } catch {
      drifted.push(path);
    }
  }

  if (drifted.length > 0) {
    const relativePaths = drifted.map((path) => path.slice(rootDir.length + 1));
    throw new Error(
      `图标生成资产未同步：\n- ${relativePaths.join("\n- ")}\n请运行 pnpm icon:build`
    );
  }
}

async function runCli() {
  const mode = process.argv[2] ?? "check";

  if (mode === "sync") {
    const changed = await syncIconAssets();
    if (changed.length > 0) {
      console.log(`已同步 ${changed.length} 个图标文件`);
    }
    return;
  }

  if (mode === "check") {
    await checkIconAssets();
    console.log("图标生成资产已同步");
    return;
  }

  throw new Error(`未知模式：${mode}`);
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedFilePath === currentFilePath) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
