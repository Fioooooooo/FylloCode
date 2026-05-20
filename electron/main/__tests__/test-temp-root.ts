import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export function createTestTempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
