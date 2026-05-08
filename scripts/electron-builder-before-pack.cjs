exports.default = async function beforePack(context) {
  const packager = context.packager.info;

  // electron-builder 26.8.1's pnpm collector can collapse deduped packages like
  // `ai` into leaf nodes and drop runtime children such as `@ai-sdk/gateway`.
  // Force the traversal collector during packaging so production dependencies are
  // resolved from the on-disk node_modules tree instead of the broken pnpm graph.
  packager.getPackageManager = async () => "traversal";
};
