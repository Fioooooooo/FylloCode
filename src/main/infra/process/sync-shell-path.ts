import spawn from "cross-spawn";
import { platform } from "@electron-toolkit/utils";

/**
 * 同步 shell 的 PATH 环境变量到当前进程。
 *
 * macOS 上从 Finder/Launchpad 启动的 App，其 PATH 通常只有基础系统路径
 *（/usr/bin:/bin:/usr/sbin:/sbin），不包含用户通过 shell 配置的工具路径
 *（如 nvm、homebrew 安装的 node、npm 等）。
 *
 * 此函数通过启动一个登录 shell 来获取完整的 PATH，并合并到 process.env.PATH 中。
 */
/** 登录 shell 探测 PATH 的超时上限。shell rc（nvm/conda 等）慢启动或卡死时，
 *  超时后放弃同步而非永久阻塞 app 启动（本函数在 whenReady 中被 await）。 */
const SHELL_PATH_TIMEOUT_MS = 5_000;

export async function syncShellPath(): Promise<void> {
  const currentPath = process.env.PATH || "";
  const isWindows = platform.isWindows;
  const delimiter = isWindows ? ";" : ":";

  let shellPath: string | undefined;

  try {
    shellPath = await new Promise<string>((resolve, reject) => {
      const [command, args] = isWindows
        ? ["cmd.exe", ["/c", "echo %PATH%"]]
        : [process.env.SHELL || "/bin/zsh", ["-ilc", "echo $PATH"]];

      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error(`shell PATH probe timed out after ${SHELL_PATH_TIMEOUT_MS}ms`));
      }, SHELL_PATH_TIMEOUT_MS);

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`shell exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  } catch {
    return;
  }

  if (!shellPath) {
    return;
  }

  const shellParts = shellPath.split(delimiter).filter(Boolean);
  const currentParts = currentPath.split(delimiter).filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const part of [...shellParts, ...currentParts]) {
    if (!seen.has(part)) {
      seen.add(part);
      merged.push(part);
    }
  }

  process.env.PATH = merged.join(delimiter);
}
