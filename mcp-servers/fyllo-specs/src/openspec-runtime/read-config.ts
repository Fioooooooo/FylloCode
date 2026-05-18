import { join } from "path";
import { readYamlFile } from "./fs";

const DEFAULT_SCHEMA = "spec-driven";

export function readProjectSchema(projectRoot: string): string {
  const config = readYamlFile<{ schema?: unknown }>(join(projectRoot, "openspec", "config.yaml"));
  const schema = config?.schema;
  return typeof schema === "string" && schema.length > 0 ? schema : DEFAULT_SCHEMA;
}
