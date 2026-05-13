import { spawn } from "child_process";
import { existsSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { OpenspecCliError, OpenspecTimeoutError } from "./types";

const TIMEOUT_MS = 30_000;
let bootstrapPath: string | null = null;

function isElectronRuntime(): boolean {
  return Boolean(process.versions.electron);
}

function ensureElectronBootstrap(): string {
  if (bootstrapPath && existsSync(bootstrapPath)) {
    return bootstrapPath;
  }

  const dir = mkdtempSync(join(tmpdir(), "fyllo-openspec-"));
  bootstrapPath = join(dir, "openspec-electron-bootstrap.mjs");
  writeFileSync(
    bootstrapPath,
    [
      "import { pathToFileURL } from 'url';",
      "process.defaultApp = true;",
      "const [, , cliPath, ...cliArgs] = process.argv;",
      "process.argv = [process.argv[0], cliPath, ...cliArgs];",
      "await import(pathToFileURL(cliPath).href);",
      "",
    ].join("\n"),
    "utf8"
  );
  return bootstrapPath;
}

export function buildSpawnArgs(cliPath: string, args: string[]): string[] {
  if (!isElectronRuntime()) {
    return [cliPath, ...args];
  }

  // Commander auto-detects Electron and otherwise treats argv[1] as a user command
  // in packaged-style Electron processes. The bootstrap restores Node CLI argv shape.
  return [ensureElectronBootstrap(), cliPath, ...args];
}

function buildEnv(extraEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DO_NOT_TRACK: "1",
    OPENSPEC_TELEMETRY: "0",
    CI: "1",
    NO_COLOR: "1",
    ...extraEnv,
  };
}

export async function spawnOpenspec(
  cliPath: string,
  args: string[],
  cwd: string,
  extraEnv: NodeJS.ProcessEnv = {},
  parseJson = true
): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const spawnArgs = buildSpawnArgs(cliPath, args);
    const child = spawn(process.execPath, spawnArgs, {
      cwd,
      env: buildEnv(extraEnv),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new OpenspecTimeoutError(`OpenSpec CLI timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new OpenspecCliError(
            [
              `OpenSpec CLI exited with code ${code ?? "unknown"}`,
              `command: ${process.execPath} ${spawnArgs.join(" ")}`,
              `cwd: ${cwd}`,
              stderr.trim() ? `stderr: ${stderr.trim().slice(0, 400)}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
            stderr.slice(0, 400),
            code ?? -1
          )
        );
        return;
      }

      if (!parseJson) {
        resolve(stdout);
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(
          new OpenspecCliError(
            "OpenSpec CLI produced invalid JSON",
            stderr.slice(0, 400),
            code ?? -1
          )
        );
      }
    });
  });
}
