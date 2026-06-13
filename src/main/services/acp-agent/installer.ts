import { promises as fs } from "fs";
import { basename, dirname, extname, join, relative } from "path";
import { tmpdir } from "os";
import { net } from "electron";
import spawn from "cross-spawn";
import {
  stripPackageVersion,
  type AcpAgentEntry,
  type AcpInstallMethod,
  type AcpInstallProgress,
  type AcpInstalledRecord,
  type AcpUninstallProgress,
} from "@shared/types/acp-agent";
import { getDataSubPath } from "@main/infra/paths";
import {
  createAgentError,
  detectAgentInstallation,
  findCommandPath,
  readInstalledRecords,
  resolveBinaryDistribution,
  runCommand,
  writeInstalledRecords,
} from "@main/domain/acp/detector";

type InstallProgressHandler = (progress: AcpInstallProgress) => void;
type UninstallProgressHandler = (progress: AcpUninstallProgress) => void;

interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

let activeMutationAgentId: string | null = null;

function summarizeCommandOutput(
  stdout: string,
  stderr: string,
  fallback = "安装失败，请重试"
): string {
  const summary = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  return summary || fallback;
}

async function runStreamingCommand(
  command: string,
  args: string[],
  env?: Record<string, string>
): Promise<CommandExecutionResult> {
  return new Promise<CommandExecutionResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : process.env,
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
      resolve({ stdout, stderr, code });
    });
  });
}

async function upsertInstalledRecord(agentId: string, record: AcpInstalledRecord): Promise<void> {
  const records = await readInstalledRecords();
  records[agentId] = record;
  await writeInstalledRecords(records);
}

async function finalizeInstallRecord(
  agent: AcpAgentEntry,
  installMethod: AcpInstallMethod,
  installPath?: string
): Promise<AcpInstalledRecord> {
  const detected = await detectAgentInstallation(agent, {
    managedBy: "fyllocode",
    installMethod,
    installPath,
    installedVersion: agent.version,
    installedAt: new Date().toISOString(),
  });

  const record: AcpInstalledRecord = {
    managedBy: "fyllocode",
    installMethod,
    installPath: detected.installPath ?? installPath,
    installedVersion: detected.detectedVersion ?? agent.version,
    installedAt: new Date().toISOString(),
  };

  await upsertInstalledRecord(agent.id, record);
  return record;
}

async function installNpx(
  agent: AcpAgentEntry,
  onProgress: InstallProgressHandler
): Promise<AcpInstalledRecord> {
  const distribution = agent.distribution.npx;
  if (!distribution) {
    throw createAgentError("INVALID_DISTRIBUTION", "Agent 缺少 npx 安装信息");
  }

  const npmPath = await findCommandPath("npm");
  if (!npmPath) {
    throw createAgentError("ENV_MISSING", "需要先安装 Node.js");
  }

  onProgress({ agentId: agent.id, status: "installing", message: "正在安装..." });
  const result = await runStreamingCommand(
    npmPath,
    ["install", "-g", distribution.package],
    distribution.env
  );
  if (result.code !== 0) {
    throw createAgentError("INSTALL_FAILED", summarizeCommandOutput(result.stdout, result.stderr));
  }

  return finalizeInstallRecord(agent, "npx");
}

async function installUvx(
  agent: AcpAgentEntry,
  onProgress: InstallProgressHandler
): Promise<AcpInstalledRecord> {
  const distribution = agent.distribution.uvx;
  if (!distribution) {
    throw createAgentError("INVALID_DISTRIBUTION", "Agent 缺少 uvx 安装信息");
  }

  const uvPath = await findCommandPath("uv");
  if (!uvPath) {
    throw createAgentError("ENV_MISSING", "需要先安装 uv");
  }

  onProgress({ agentId: agent.id, status: "installing", message: "正在安装..." });
  const result = await runStreamingCommand(
    uvPath,
    ["tool", "install", distribution.package],
    distribution.env
  );
  if (result.code !== 0) {
    throw createAgentError("INSTALL_FAILED", summarizeCommandOutput(result.stdout, result.stderr));
  }

  return finalizeInstallRecord(agent, "uvx");
}

async function uninstallNpx(
  agent: AcpAgentEntry,
  onProgress: UninstallProgressHandler
): Promise<void> {
  const distribution = agent.distribution.npx;
  if (!distribution) {
    throw createAgentError("INVALID_DISTRIBUTION", "Agent 缺少 npx 安装信息");
  }

  const npmPath = await findCommandPath("npm");
  if (!npmPath) {
    throw createAgentError("ENV_MISSING", "需要先安装 Node.js");
  }

  onProgress({ agentId: agent.id, status: "uninstalling", message: "正在卸载..." });
  const result = await runStreamingCommand(
    npmPath,
    ["uninstall", "-g", stripPackageVersion(distribution.package)],
    distribution.env
  );
  if (result.code !== 0) {
    throw createAgentError(
      "UNINSTALL_FAILED",
      summarizeCommandOutput(result.stdout, result.stderr, "卸载失败，请重试")
    );
  }
}

async function uninstallUvx(
  agent: AcpAgentEntry,
  onProgress: UninstallProgressHandler
): Promise<void> {
  const distribution = agent.distribution.uvx;
  if (!distribution) {
    throw createAgentError("INVALID_DISTRIBUTION", "Agent 缺少 uvx 安装信息");
  }

  const uvPath = await findCommandPath("uv");
  if (!uvPath) {
    throw createAgentError("ENV_MISSING", "需要先安装 uv");
  }

  onProgress({ agentId: agent.id, status: "uninstalling", message: "正在卸载..." });
  const result = await runStreamingCommand(
    uvPath,
    ["tool", "uninstall", stripPackageVersion(distribution.package)],
    distribution.env
  );
  if (result.code !== 0) {
    throw createAgentError(
      "UNINSTALL_FAILED",
      summarizeCommandOutput(result.stdout, result.stderr, "卸载失败，请重试")
    );
  }
}

function getArchiveExtension(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tar.gz")) {
    return ".tar.gz";
  }
  if (lower.endsWith(".tar.xz")) {
    return ".tar.xz";
  }
  if (lower.endsWith(".tgz")) {
    return ".tgz";
  }
  return extname(lower);
}

/** 二进制下载超时上限。避免 net.fetch 在网络挂起时永久阻塞，
 *  进而让 activeMutationAgentId 互斥锁无法释放、后续安装全部 INSTALL_BUSY。 */
const DOWNLOAD_TIMEOUT_MS = 60_000;

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await net.fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw createAgentError("DOWNLOAD_FAILED", "下载失败，请重试");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);
  } finally {
    clearTimeout(timer);
  }
}

async function extractArchive(archivePath: string, targetDirectory: string): Promise<void> {
  const extension = getArchiveExtension(archivePath);

  if (extension === ".zip") {
    const unzipPath = await findCommandPath("unzip");
    if (!unzipPath) {
      throw createAgentError("ENV_MISSING", "当前系统缺少 unzip，无法安装二进制 Agent");
    }

    const result = await runCommand(unzipPath, ["-o", archivePath, "-d", targetDirectory]);
    if (result.code !== 0) {
      throw createAgentError(
        "INSTALL_FAILED",
        summarizeCommandOutput(result.stdout, result.stderr)
      );
    }
    return;
  }

  if (
    extension === ".tar.gz" ||
    extension === ".tgz" ||
    extension === ".tar.xz" ||
    extension === ".tar"
  ) {
    const tarPath = await findCommandPath("tar");
    if (!tarPath) {
      throw createAgentError("ENV_MISSING", "当前系统缺少 tar，无法安装二进制 Agent");
    }

    const args =
      extension === ".tar.gz" || extension === ".tgz"
        ? ["-xzf", archivePath, "-C", targetDirectory]
        : extension === ".tar.xz"
          ? ["-xJf", archivePath, "-C", targetDirectory]
          : ["-xf", archivePath, "-C", targetDirectory];
    const result = await runCommand(tarPath, args);
    if (result.code !== 0) {
      throw createAgentError(
        "INSTALL_FAILED",
        summarizeCommandOutput(result.stdout, result.stderr)
      );
    }
    return;
  }

  await fs.copyFile(archivePath, join(targetDirectory, basename(archivePath)));
}

async function findFileByBasename(
  rootDirectory: string,
  expectedBaseName: string
): Promise<string | null> {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileByBasename(absolutePath, expectedBaseName);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (entry.name === expectedBaseName) {
      return absolutePath;
    }
  }

  return null;
}

async function resolveBinaryExecutablePath(
  extractedDirectory: string,
  commandPath: string
): Promise<string> {
  const directPath = join(extractedDirectory, commandPath);
  try {
    await fs.access(directPath);
    return directPath;
  } catch {
    const fallback = await findFileByBasename(extractedDirectory, basename(commandPath));
    if (fallback) {
      return fallback;
    }
  }

  throw createAgentError("INSTALL_FAILED", "未找到已安装的可执行文件");
}

async function installBinary(
  agent: AcpAgentEntry,
  onProgress: InstallProgressHandler
): Promise<AcpInstalledRecord> {
  const binary = resolveBinaryDistribution(agent.distribution.binary);
  if (!binary) {
    throw createAgentError("PLATFORM_UNSUPPORTED", "当前平台不支持此安装方式");
  }

  const tempRoot = await fs.mkdtemp(join(tmpdir(), "fyllocode-agent-"));
  const archivePath = join(tempRoot, `download${getArchiveExtension(binary.archive) || ".bin"}`);
  const extractedDirectory = join(tempRoot, "extracted");
  const finalDirectory = join(getDataSubPath("acp"), "bin", agent.id);

  try {
    await fs.mkdir(extractedDirectory, { recursive: true });

    onProgress({ agentId: agent.id, status: "downloading", message: "正在下载..." });
    await downloadFile(binary.archive, archivePath);

    onProgress({ agentId: agent.id, status: "installing", message: "正在安装..." });
    await extractArchive(archivePath, extractedDirectory);

    const executablePath = await resolveBinaryExecutablePath(extractedDirectory, binary.cmd);
    const executableRelativePath = relative(extractedDirectory, executablePath);

    await fs.mkdir(dirname(finalDirectory), { recursive: true });
    await fs.rm(finalDirectory, { recursive: true, force: true });
    await fs.rename(extractedDirectory, finalDirectory);

    const finalExecutablePath = join(finalDirectory, executableRelativePath);
    await fs.chmod(finalExecutablePath, 0o755).catch(() => undefined);

    return finalizeInstallRecord(agent, "binary", finalExecutablePath);
  } catch (error) {
    await fs.rm(finalDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error instanceof Error && "code" in error
      ? error
      : createAgentError("DOWNLOAD_FAILED", "下载失败，请重试");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function uninstallBinary(
  agent: AcpAgentEntry,
  onProgress: UninstallProgressHandler
): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(agent.id)) {
    throw createAgentError("INVALID_AGENT_ID", "非法 Agent ID");
  }

  const targetDir = join(getDataSubPath("acp"), "bin", agent.id);
  onProgress({ agentId: agent.id, status: "uninstalling", message: "正在卸载..." });

  try {
    await fs.rm(targetDir, { recursive: true, force: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      const message = error instanceof Error ? error.message : "卸载失败，请重试";
      throw createAgentError("UNINSTALL_FAILED", message);
    }
  }
}

export async function installAgent(
  agent: AcpAgentEntry,
  onProgress: InstallProgressHandler
): Promise<AcpInstalledRecord> {
  if (activeMutationAgentId) {
    throw createAgentError("INSTALL_BUSY", "请等待当前操作完成");
  }

  activeMutationAgentId = agent.id;

  try {
    const record = agent.distribution.npx
      ? await installNpx(agent, onProgress)
      : agent.distribution.uvx
        ? await installUvx(agent, onProgress)
        : await installBinary(agent, onProgress);

    onProgress({ agentId: agent.id, status: "done" });
    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : "安装失败，请重试";
    onProgress({ agentId: agent.id, status: "error", message });
    throw error;
  } finally {
    activeMutationAgentId = null;
  }
}

export async function uninstallAgent(
  agent: AcpAgentEntry,
  installMethod: AcpInstallMethod,
  onProgress: UninstallProgressHandler
): Promise<void> {
  if (activeMutationAgentId) {
    throw createAgentError("INSTALL_BUSY", "请等待当前操作完成");
  }

  activeMutationAgentId = agent.id;

  try {
    if (installMethod === "npx") {
      await uninstallNpx(agent, onProgress);
    } else if (installMethod === "uvx") {
      await uninstallUvx(agent, onProgress);
    } else {
      await uninstallBinary(agent, onProgress);
    }

    const verification = await detectAgentInstallation(agent);
    if (verification.installed) {
      throw createAgentError(
        "UNINSTALL_FAILED",
        "卸载命令已执行但 Agent 仍可检测到，请手动检查环境"
      );
    }

    onProgress({ agentId: agent.id, status: "done" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "卸载失败，请重试";
    onProgress({ agentId: agent.id, status: "error", message });
    throw error;
  } finally {
    activeMutationAgentId = null;
  }
}
