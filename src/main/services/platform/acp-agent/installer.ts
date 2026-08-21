import { promises as fs } from "fs";
import type { FileHandle } from "fs/promises";
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "path";
import { tmpdir } from "os";
import type { ChildProcess } from "child_process";
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
  detectAgentInstallation,
  findCommandPath,
  readInstalledRecords,
  resolveBinaryDistribution,
  writeInstalledRecords,
} from "@main/infra/acp/detector";
import { decompressArchive } from "@main/infra/archive/decompress";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError, type IpcError } from "@shared/errors/ipc-error";
import { isShuttingDown } from "@main/bootstrap/lifecycle";

type InstallProgressHandler = (progress: AcpInstallProgress) => void;
type UninstallProgressHandler = (progress: AcpUninstallProgress) => void;

interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

let activeMutationAgentId: string | null = null;
const activeFetchControllers = new Set<AbortController>();
const activeInstallerChildren = new Set<ChildProcess>();
const inactiveWaiters = new Set<() => void>();
let installerShuttingDown = false;

function settleInstallerWaitersIfInactive(): void {
  if (
    activeMutationAgentId ||
    activeFetchControllers.size > 0 ||
    activeInstallerChildren.size > 0
  ) {
    return;
  }
  for (const resolve of inactiveWaiters) resolve();
  inactiveWaiters.clear();
}

function ensureInstallerAvailable(): void {
  if (installerShuttingDown || isShuttingDown()) {
    throw ipcError(IpcErrorCodes.APPLICATION_SHUTTING_DOWN, "FylloCode 正在退出");
  }
}

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
    ensureInstallerAvailable();
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : process.env,
      detached: process.platform !== "win32",
    });
    activeInstallerChildren.add(child);

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      activeInstallerChildren.delete(child);
      settleInstallerWaitersIfInactive();
      reject(error);
    });
    child.on("close", (code) => {
      activeInstallerChildren.delete(child);
      settleInstallerWaitersIfInactive();
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
  const record = await buildInstallRecord(agent, installMethod, installPath);
  await upsertInstalledRecord(agent.id, record);
  return record;
}

async function buildInstallRecord(
  agent: AcpAgentEntry,
  installMethod: AcpInstallMethod,
  installPath?: string,
  recordInstallPath = installPath
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
    installPath: recordInstallPath ?? detected.installPath ?? installPath,
    installedVersion: detected.detectedVersion ?? agent.version,
    installedAt: new Date().toISOString(),
  };
  return record;
}

async function installNpx(
  agent: AcpAgentEntry,
  onProgress: InstallProgressHandler
): Promise<AcpInstalledRecord> {
  const distribution = agent.distribution.npx;
  if (!distribution) {
    throw ipcError("INVALID_DISTRIBUTION", "Agent 缺少 npx 安装信息");
  }

  const npmPath = await findCommandPath("npm");
  if (!npmPath) {
    throw ipcError("ENV_MISSING", "需要先安装 Node.js");
  }

  onProgress({ agentId: agent.id, status: "installing", message: "正在安装..." });
  const result = await runStreamingCommand(
    npmPath,
    ["install", "-g", distribution.package],
    distribution.env
  );
  if (result.code !== 0) {
    throw ipcError("INSTALL_FAILED", summarizeCommandOutput(result.stdout, result.stderr));
  }

  return finalizeInstallRecord(agent, "npx");
}

async function installUvx(
  agent: AcpAgentEntry,
  onProgress: InstallProgressHandler
): Promise<AcpInstalledRecord> {
  const distribution = agent.distribution.uvx;
  if (!distribution) {
    throw ipcError("INVALID_DISTRIBUTION", "Agent 缺少 uvx 安装信息");
  }

  const uvPath = await findCommandPath("uv");
  if (!uvPath) {
    throw ipcError("ENV_MISSING", "需要先安装 uv");
  }

  onProgress({ agentId: agent.id, status: "installing", message: "正在安装..." });
  const result = await runStreamingCommand(
    uvPath,
    ["tool", "install", distribution.package],
    distribution.env
  );
  if (result.code !== 0) {
    throw ipcError("INSTALL_FAILED", summarizeCommandOutput(result.stdout, result.stderr));
  }

  return finalizeInstallRecord(agent, "uvx");
}

async function uninstallNpx(
  agent: AcpAgentEntry,
  onProgress: UninstallProgressHandler
): Promise<void> {
  const distribution = agent.distribution.npx;
  if (!distribution) {
    throw ipcError("INVALID_DISTRIBUTION", "Agent 缺少 npx 安装信息");
  }

  const npmPath = await findCommandPath("npm");
  if (!npmPath) {
    throw ipcError("ENV_MISSING", "需要先安装 Node.js");
  }

  onProgress({ agentId: agent.id, status: "uninstalling", message: "正在卸载..." });
  const result = await runStreamingCommand(
    npmPath,
    ["uninstall", "-g", stripPackageVersion(distribution.package)],
    distribution.env
  );
  if (result.code !== 0) {
    throw ipcError(
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
    throw ipcError("INVALID_DISTRIBUTION", "Agent 缺少 uvx 安装信息");
  }

  const uvPath = await findCommandPath("uv");
  if (!uvPath) {
    throw ipcError("ENV_MISSING", "需要先安装 uv");
  }

  onProgress({ agentId: agent.id, status: "uninstalling", message: "正在卸载..." });
  const result = await runStreamingCommand(
    uvPath,
    ["tool", "uninstall", stripPackageVersion(distribution.package)],
    distribution.env
  );
  if (result.code !== 0) {
    throw ipcError(
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
  if (lower.endsWith(".tar.bz2")) {
    return ".tar.bz2";
  }
  if (lower.endsWith(".tbz2")) {
    return ".tbz2";
  }
  return extname(lower);
}

// 无数据超时允许慢速持续下载；总时长上限避免安装锁被极慢连接长期占用。
const DOWNLOAD_IDLE_TIMEOUT_MS = 60_000;
const DOWNLOAD_MAX_DURATION_MS = 10 * 60_000;

function isIpcError(error: unknown): error is IpcError {
  const code = (error as { code?: unknown } | null)?.code;
  return error instanceof Error && typeof code === "string" && code in IpcErrorCodes;
}

async function writeChunk(fileHandle: FileHandle, chunk: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const { bytesWritten } = await fileHandle.write(chunk, offset, chunk.byteLength - offset, null);
    if (bytesWritten === 0) {
      throw new Error("Unable to write downloaded data");
    }
    offset += bytesWritten;
  }
}

async function downloadFile(url: string, outputPath: string): Promise<string> {
  ensureInstallerAvailable();
  const controller = new AbortController();
  activeFetchControllers.add(controller);
  const hash = createHash("sha256");
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let fileHandle: FileHandle | undefined;

  const abortDownload = (): void => {
    controller.abort();
  };
  const refreshIdleTimeout = (): void => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(abortDownload, DOWNLOAD_IDLE_TIMEOUT_MS);
  };
  const maxDurationTimer = setTimeout(abortDownload, DOWNLOAD_MAX_DURATION_MS);

  try {
    try {
      refreshIdleTimeout();
      const response = await net.fetch(url, { signal: controller.signal });
      if (!response.ok || !response.body) {
        throw ipcError("DOWNLOAD_FAILED", "下载失败，请重试");
      }

      refreshIdleTimeout();
      fileHandle = await fs.open(outputPath, "w");
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          refreshIdleTimeout();
          hash.update(value);
          await writeChunk(fileHandle, value);
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(idleTimer);
      clearTimeout(maxDurationTimer);
      activeFetchControllers.delete(controller);
      settleInstallerWaitersIfInactive();
      await fileHandle?.close();
    }
  } catch (error) {
    throw isIpcError(error) ? error : ipcError("DOWNLOAD_FAILED", "下载失败，请重试");
  }

  return hash.digest("hex");
}

async function extractArchive(archivePath: string, targetDirectory: string): Promise<void> {
  await decompressArchive(archivePath, targetDirectory);
}

/**
 * Zip Slip guard. After extraction, walk the tree and assert every real path
 * (symlinks resolved) stays inside `rootDirectory`. A malicious archive with
 * `../` entries or absolute/symlink targets would land outside the extraction
 * dir; reject the install rather than write outside it. Archive sources are
 * trusted registry URLs, so this is defence-in-depth, not the primary control.
 */
async function assertNoPathEscape(rootDirectory: string): Promise<void> {
  const root = await fs.realpath(rootDirectory);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      let real: string;
      try {
        real = await fs.realpath(entryPath);
      } catch {
        // Dangling symlink or unreadable entry — treat as unsafe.
        throw ipcError("INSTALL_FAILED", "归档包含非法路径，已中止安装");
      }
      if (real !== root && !real.startsWith(rootPrefix)) {
        throw ipcError("INSTALL_FAILED", "归档包含越界路径，已中止安装");
      }
      if (entry.isDirectory()) {
        await walk(entryPath);
      }
    }
  };

  await walk(root);
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

  throw ipcError("INSTALL_FAILED", "未找到已安装的可执行文件");
}

function parseExpectedSha256(value: string | undefined): Buffer | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw ipcError("INSTALL_FAILED", "Agent binary.sha256 必须是 64 位十六进制摘要");
  }
  return Buffer.from(value, "hex");
}

function assertPathInside(rootDirectory: string, targetPath: string): void {
  const targetRelativePath = relative(rootDirectory, targetPath);
  if (
    !targetRelativePath ||
    isAbsolute(targetRelativePath) ||
    targetRelativePath === ".." ||
    targetRelativePath.startsWith(`..${sep}`)
  ) {
    throw ipcError("INSTALL_FAILED", "归档可执行文件路径越界，已中止安装");
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function createSiblingPath(parentDirectory: string, kind: string, agentId: string): string {
  return join(parentDirectory, `.${kind}-${agentId}-${randomUUID()}`);
}

async function installBinary(
  agent: AcpAgentEntry,
  onProgress: InstallProgressHandler
): Promise<AcpInstalledRecord> {
  const binary = resolveBinaryDistribution(agent.distribution.binary);
  if (!binary) {
    throw ipcError("PLATFORM_UNSUPPORTED", "当前平台不支持此安装方式");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(agent.id)) {
    throw ipcError("INVALID_AGENT_ID", "非法 Agent ID");
  }

  const expectedSha256 = parseExpectedSha256(binary.sha256);

  const tempRoot = await fs.mkdtemp(join(tmpdir(), "fyllocode-agent-"));
  const archivePath = join(tempRoot, `download${getArchiveExtension(binary.archive) || ".bin"}`);
  const extractedDirectory = join(tempRoot, "extracted");
  const finalDirectory = join(getDataSubPath("acp"), "bin", agent.id);
  const finalParentDirectory = dirname(finalDirectory);
  let stagingDirectory: string | undefined;
  let backupDirectory: string | undefined;
  let finalDirectoryCommitted = false;
  let backupMoved = false;
  let transactionCommitted = false;

  try {
    await fs.mkdir(extractedDirectory, { recursive: true });

    onProgress({ agentId: agent.id, status: "downloading", message: "正在下载..." });
    const actualSha256 = await downloadFile(binary.archive, archivePath);
    if (expectedSha256) {
      const actualDigest = Buffer.from(actualSha256, "hex");
      if (
        actualDigest.length !== expectedSha256.length ||
        !timingSafeEqual(actualDigest, expectedSha256)
      ) {
        throw ipcError("INSTALL_FAILED", "Agent binary.sha256 校验不匹配");
      }
    }

    onProgress({ agentId: agent.id, status: "installing", message: "正在安装..." });
    await extractArchive(archivePath, extractedDirectory);
    await assertNoPathEscape(extractedDirectory);

    const executablePath = await resolveBinaryExecutablePath(extractedDirectory, binary.cmd);
    assertPathInside(extractedDirectory, executablePath);
    const executableRelativePath = relative(extractedDirectory, executablePath);
    const finalExecutablePath = join(finalDirectory, executableRelativePath);
    const record = await buildInstallRecord(agent, "binary", executablePath, finalExecutablePath);

    await fs.mkdir(finalParentDirectory, { recursive: true });
    stagingDirectory = createSiblingPath(finalParentDirectory, "staging", agent.id);
    await fs.mkdir(stagingDirectory);
    await fs.cp(extractedDirectory, stagingDirectory, { recursive: true });

    if (await pathExists(finalDirectory)) {
      backupDirectory = createSiblingPath(finalParentDirectory, "backup", agent.id);
      await fs.rename(finalDirectory, backupDirectory);
      backupMoved = true;
    }

    await fs.rename(stagingDirectory, finalDirectory);
    stagingDirectory = undefined;
    finalDirectoryCommitted = true;

    await fs.chmod(finalExecutablePath, 0o755);
    await upsertInstalledRecord(agent.id, record);
    transactionCommitted = true;

    if (backupDirectory) {
      await fs.rm(backupDirectory, { recursive: true, force: true }).catch(() => undefined);
      backupDirectory = undefined;
    }
    return record;
  } catch (error) {
    if (!transactionCommitted) {
      if (finalDirectoryCommitted) {
        await fs.rm(finalDirectory, { recursive: true, force: true });
      }
      if (stagingDirectory) {
        await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
      if (backupMoved && backupDirectory) {
        await fs.rename(backupDirectory, finalDirectory);
        backupDirectory = undefined;
      }
    }

    if (isIpcError(error)) {
      throw error;
    }
    throw ipcError("INSTALL_FAILED", error instanceof Error ? error.message : "安装失败，请重试");
  } finally {
    if (stagingDirectory) {
      await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function uninstallBinary(
  agent: AcpAgentEntry,
  onProgress: UninstallProgressHandler
): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(agent.id)) {
    throw ipcError("INVALID_AGENT_ID", "非法 Agent ID");
  }

  const targetDir = join(getDataSubPath("acp"), "bin", agent.id);
  onProgress({ agentId: agent.id, status: "uninstalling", message: "正在卸载..." });

  try {
    await fs.rm(targetDir, { recursive: true, force: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      const message = error instanceof Error ? error.message : "卸载失败，请重试";
      throw ipcError("UNINSTALL_FAILED", message);
    }
  }
}

export async function installAgent(
  agent: AcpAgentEntry,
  onProgress: InstallProgressHandler
): Promise<AcpInstalledRecord> {
  ensureInstallerAvailable();
  if (activeMutationAgentId) {
    throw ipcError("INSTALL_BUSY", "请等待当前操作完成");
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
    settleInstallerWaitersIfInactive();
  }
}

export async function uninstallAgent(
  agent: AcpAgentEntry,
  installMethod: AcpInstallMethod,
  onProgress: UninstallProgressHandler
): Promise<void> {
  ensureInstallerAvailable();
  if (activeMutationAgentId) {
    throw ipcError("INSTALL_BUSY", "请等待当前操作完成");
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
      throw ipcError("UNINSTALL_FAILED", "卸载命令已执行但 Agent 仍可检测到，请手动检查环境");
    }

    onProgress({ agentId: agent.id, status: "done" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "卸载失败，请重试";
    onProgress({ agentId: agent.id, status: "error", message });
    throw error;
  } finally {
    activeMutationAgentId = null;
    settleInstallerWaitersIfInactive();
  }
}

export function abortActiveAgentOperations(): void {
  installerShuttingDown = true;
  for (const controller of activeFetchControllers) controller.abort();
  for (const child of activeInstallerChildren) {
    try {
      child.kill("SIGTERM");
    } catch {
      // force phase handles process-tree termination if graceful signalling fails.
    }
  }
}

function forceKillInstallerChild(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  const pid = child.pid;
  if (process.platform === "win32") {
    try {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        detached: true,
      });
      killer.unref();
    } catch {
      // Emergency teardown is best-effort and must never block process exit.
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      // Emergency teardown is best-effort and must never block process exit.
    }
  }
}

export function forceAbortActiveAgentOperations(): void {
  abortActiveAgentOperations();
  for (const child of activeInstallerChildren) forceKillInstallerChild(child);
}

export async function awaitActiveAgentOperations(): Promise<void> {
  abortActiveAgentOperations();
  if (
    !activeMutationAgentId &&
    activeFetchControllers.size === 0 &&
    activeInstallerChildren.size === 0
  ) {
    return;
  }
  await new Promise<void>((resolve) => inactiveWaiters.add(resolve));
}

export function getActiveAgentOperationProcessIds(): number[] {
  return [...activeInstallerChildren]
    .map((child) => child.pid)
    .filter((pid): pid is number => pid !== undefined);
}
