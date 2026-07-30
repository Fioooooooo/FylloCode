import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkIconAssets,
  syncIconAssets,
  validateIconSources,
} from "../../../scripts/icon/assets.mjs";

const pureIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 326 283.51">
  <path d="a"/>
  <path d="b"/>
  <path d="c"/>
</svg>
`;

const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024"/>
  <image data-icon-source="icon.svg" href="icon.svg"/>
</svg>
`;

describe("icon assets", () => {
  let rootDir;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "fyllocode-icon-assets-"));
    await mkdir(join(rootDir, "resources"), { recursive: true });
    await writeFile(join(rootDir, "resources/icon.svg"), pureIcon);
    await writeFile(join(rootDir, "resources/app-icon.svg"), appIcon);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("synchronizes renderer and docs copies idempotently", async () => {
    const firstChanged = await syncIconAssets(rootDir);
    const secondChanged = await syncIconAssets(rootDir);

    expect(firstChanged).toHaveLength(3);
    expect(secondChanged).toHaveLength(0);
    await expect(checkIconAssets(rootDir)).resolves.toBeUndefined();

    const [source, app, renderer, docs] = await Promise.all([
      readFile(join(rootDir, "resources/icon.svg"), "utf8"),
      readFile(join(rootDir, "resources/app-icon.svg"), "utf8"),
      readFile(join(rootDir, "src/renderer/public/icon.svg"), "utf8"),
      readFile(join(rootDir, "docs/public/assets/fyllocode.svg"), "utf8"),
    ]);
    expect(app).toContain('data-icon-source="icon.svg"');
    expect(app).toContain("data:image/svg+xml;base64,");
    expect(app).not.toContain('href="icon.svg"');
    expect(renderer).toBe(source);
    expect(docs).toBe(source);
  });

  it("reports drifted and missing generated files", async () => {
    await syncIconAssets(rootDir);
    await writeFile(join(rootDir, "src/renderer/public/icon.svg"), "<svg/>");
    await rm(join(rootDir, "docs/public/assets/fyllocode.svg"));

    await expect(checkIconAssets(rootDir)).rejects.toThrow("src/renderer/public/icon.svg");
    await expect(checkIconAssets(rootDir)).rejects.toThrow("docs/public/assets/fyllocode.svg");
  });

  it("reports an app icon whose embedded pure icon is stale", async () => {
    await syncIconAssets(rootDir);
    await writeFile(join(rootDir, "resources/icon.svg"), pureIcon.replace('d="a"', 'd="changed"'));

    await expect(checkIconAssets(rootDir)).rejects.toThrow("内嵌的 icon.svg 未同步");
  });

  it("rejects effects in the pure icon source", async () => {
    await writeFile(
      join(rootDir, "resources/icon.svg"),
      pureIcon.replace("</svg>", "<filter/><feDropShadow/></svg>")
    );

    await expect(validateIconSources(rootDir)).rejects.toThrow("必须是纯图标");
  });

  it("requires app-icon.svg to use the generated image without copied paths", async () => {
    await writeFile(
      join(rootDir, "resources/app-icon.svg"),
      appIcon.replace("</svg>", '<path d="duplicated"/></svg>')
    );

    await expect(syncIconAssets(rootDir)).rejects.toThrow("不能复制品牌路径");
  });
});
