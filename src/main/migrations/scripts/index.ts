import { migrate as migrate001 } from "./20260601_001_config-options-camel-case";
import { migrate as migrate002 } from "./20260601_002_installed-at-iso";
import type { Migration } from "../types";

// 按文件名字母序追加新迁移到此数组末尾，顺序即执行顺序。
export const migrations: Migration[] = [
  { id: "20260601_001_config-options-camel-case", migrate: migrate001 },
  { id: "20260601_002_installed-at-iso", migrate: migrate002 },
];
