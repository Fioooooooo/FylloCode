import { build } from "esbuild";
import { mkdir } from "fs/promises";
import { join } from "path";

const repoRoot = process.cwd();

const bundledMcpServers = [
  {
    name: "fyllo-specs",
    external: ["@fission-ai/openspec"],
  },
  {
    name: "fyllo-cortex",
    external: [],
  },
];

const sharedBuildOptions = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  minify: true,
  loader: {
    ".md": "text",
  },
  alias: {
    "@shared": join(repoRoot, "src", "shared"),
    "@main": join(repoRoot, "src", "main"),
  },
  // Some ESM deps (e.g. fdir via tinyglobby) use `createRequire(import.meta.url)`.
  // esbuild rewrites `import.meta` to `{}` in CJS output, which breaks createRequire.
  // Provide a valid file URL so those call sites keep working.
  banner: {
    js: "const __esbuild_import_meta_url = require('url').pathToFileURL(__filename).href;",
  },
  define: {
    "import.meta.url": "__esbuild_import_meta_url",
  },
};

for (const server of bundledMcpServers) {
  const outDir = join(repoRoot, "out", "mcp-servers", server.name);
  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: [join(repoRoot, "src", "mcp-servers", server.name, "src", "index.ts")],
    outfile: join(outDir, "index.js"),
    external: server.external,
    ...sharedBuildOptions,
  });
}
