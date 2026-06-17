import spawn from "cross-spawn";

const GIT_TIMEOUT_MS = 10_000;

export function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LC_ALL: "C",
        LANG: "C",
        LANGUAGE: "C",
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      settle(() => {
        child.kill();
        reject(new Error(`git ${args.join(" ")} timed out after ${GIT_TIMEOUT_MS}ms`));
      });
    }, GIT_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      settle(() => reject(error));
    });
    child.on("close", (code) => {
      settle(() => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`));
      });
    });
  });
}
