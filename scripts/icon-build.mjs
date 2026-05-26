import { existsSync } from "node:fs";
import { mkdir, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import spawn from "cross-spawn";

const rootDir = process.cwd();
const sourceSvg = join(rootDir, "resources", "app-icon.svg");
const buildDir = join(rootDir, "build");
const resourcesDir = join(rootDir, "resources");
const tempRoot = join(tmpdir(), `fyllocode-icon-${Date.now()}`);
const tempPng = join(tempRoot, "icon-1024.png");
const iconsetDir = join(tempRoot, "icon.iconset");

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function ensureTool(command, hint) {
  try {
    await run("bash", ["-lc", `command -v ${command} >/dev/null 2>&1`], { stdio: "ignore" });
  } catch {
    throw new Error(`Missing ${command}. Install it with: ${hint}`);
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function main() {
  if (!existsSync(sourceSvg)) {
    throw new Error(`Missing source SVG: ${sourceSvg}`);
  }

  await ensureTool("rsvg-convert", "brew install librsvg");
  await ensureTool("iconutil", "already available on macOS");
  await ensureTool("magick", "brew install imagemagick");

  await mkdir(buildDir, { recursive: true });
  await mkdir(resourcesDir, { recursive: true });
  await mkdir(tempRoot, { recursive: true });
  await mkdir(iconsetDir, { recursive: true });

  await run("rsvg-convert", ["--width=1024", "--height=1024", "--output", tempPng, sourceSvg]);

  const sizes = [
    [16, 16, "icon_16x16.png"],
    [32, 32, "icon_16x16@2x.png"],
    [32, 32, "icon_32x32.png"],
    [64, 64, "icon_32x32@2x.png"],
    [128, 128, "icon_128x128.png"],
    [256, 256, "icon_128x128@2x.png"],
    [256, 256, "icon_256x256.png"],
    [512, 512, "icon_256x256@2x.png"],
    [512, 512, "icon_512x512.png"],
    [1024, 1024, "icon_512x512@2x.png"],
  ];

  for (const [width, height, filename] of sizes) {
    await run("sips", [
      "-z",
      String(height),
      String(width),
      tempPng,
      "--out",
      join(iconsetDir, filename),
    ]);
  }

  await run("iconutil", ["-c", "icns", iconsetDir, "-o", join(buildDir, "icon.icns")]);
  await run("magick", [
    tempPng,
    "-define",
    "icon:auto-resize=256,128,64,48,32,16",
    join(buildDir, "icon.ico"),
  ]);

  await run("sips", ["-z", "512", "512", tempPng, "--out", join(buildDir, "icon.png")]);
  await copyFile(join(buildDir, "icon.png"), join(resourcesDir, "icon.png"));

  await rm(tempRoot, { recursive: true, force: true });
}

main().catch(async (error) => {
  try {
    await rm(tempRoot, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
