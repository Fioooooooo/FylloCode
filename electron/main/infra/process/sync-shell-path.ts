import { spawn } from "child_process";
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

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => {
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
