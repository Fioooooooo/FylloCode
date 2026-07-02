export function resolveProjectRoot(): string {
  return process.env.FYLLO_PROJECT_PATH || process.cwd();
}
