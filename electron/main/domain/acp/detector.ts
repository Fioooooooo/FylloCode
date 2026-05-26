import { promises as fs } from "fs";
import { join } from "path";
import spawn from "cross-spawn";
import type {
  AcpAgentBinaryDistribution,
  AcpAgentDistribution,
  AcpAgentEntry,
  AcpAgentStatus,
  AcpInstallMethod,
  AcpInstalledMap,
  AcpInstalledRecord,
} from "@shared/types/acp-agent";
import { getDataSubPath } from "@main/infra/paths";

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

interface DetectedInstallation {
  installed: boolean;
  installMethod?: AcpInstallMethod;
  detectedVersion?: string;
  installPath?: string;
}

export function createAgentError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function getInstalledRecordsPath(): string {
  return join(getDataSubPath("acp"), "installed.json");
}

async function ensureAgentsDirectory(): Promise<void> {
  await fs.mkdir(getDataSubPath("acp"), { recursive: true });
}

async function pathExists(path: string | undefined): Promise<boolean> {
  if (!path) {
    return false;
  }

  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readInstalledRecords(): Promise<AcpInstalledMap> {
  try {
    const content = await fs.readFile(getInstalledRecordsPath(), "utf8");
    return JSON.parse(content) as AcpInstalledMap;
  } catch {
    return {};
  }
}

export async function writeInstalledRecords(records: AcpInstalledMap): Promise<void> {
  await ensureAgentsDirectory();
  await fs.writeFile(getInstalledRecordsPath(), JSON.stringify(records, null, 2), "utf8");
}

export async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
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

export async function findCommandPath(command: string): Promise<string | null> {
  const locator = process.platform === "win32" ? "where" : "which";

  try {
    const result = await runCommand(locator, [command]);
    if (result.code !== 0) {
      return null;
    }

    const matches = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return matches[0] ?? null;
  } catch {
    return null;
  }
}

function normalizeVersion(version: string | undefined): string | undefined {
  if (!version) {
    return undefined;
  }

  return version.trim().replace(/^v/i, "");
}

function parseVersionFromText(text: string): string | undefined {
  const match = text.match(/v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
  return normalizeVersion(match?.[1]);
}

export function compareVersions(left: string, right: string): number {
  const normalize = (value: string): number[] =>
    value
      .trim()
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((segment) => Number.parseInt(segment.replace(/\D/g, ""), 10) || 0);

  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) {
      return 1;
    }
    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function inferInstallMethod(distribution: AcpAgentDistribution): AcpInstallMethod {
  if (distribution.npx) {
    return "npx";
  }
  if (distribution.uvx) {
    return "uvx";
  }
  return "binary";
}

export function resolveBinaryDistribution(
  binaryDistributions: AcpAgentDistribution["binary"]
): AcpAgentBinaryDistribution | null {
  if (!binaryDistributions) {
    return null;
  }

  // process.arch 用 Node 命名（arm64/x64），registry 用 Linux 命名（aarch64/x86_64）
  const archMap: Record<string, string> = { arm64: "aarch64", x64: "x86_64" };
  const arch = archMap[process.arch] ?? process.arch;

  const keys = [
    `${process.platform}-${arch}`,
    `${process.platform}_${arch}`,
    `${process.platform}-${process.arch}`,
    process.platform,
  ];

  for (const key of keys) {
    if (binaryDistributions[key]) {
      return binaryDistributions[key];
    }
  }

  return null;
}

async function tryReadCommandVersion(commandPath: string): Promise<string | undefined> {
  try {
    const result = await runCommand(commandPath, ["--version"]);
    if (result.code !== 0) {
      return undefined;
    }
    return parseVersionFromText(`${result.stdout}\n${result.stderr}`);
  } catch {
    return undefined;
  }
}

async function detectNpxInstallation(agent: AcpAgentEntry): Promise<DetectedInstallation> {
  const distribution = agent.distribution.npx;
  if (!distribution) {
    return { installed: false };
  }

  const npmPath = await findCommandPath("npm");
  if (!npmPath) {
    return { installed: false, installMethod: "npx" };
  }

  // npm list 只传包名不带版本，避免版本不匹配时误判为未安装
  const barePackageName = distribution.package
    .replace(/@[\d].*$/, "")
    .replace(/(@[^@/]+)@.*$/, "$1");

  const result = await runCommand(npmPath, ["list", "-g", barePackageName, "--depth=0", "--json"]);

  let payload: {
    dependencies?: Record<string, { version?: string; path?: string }>;
  } = {};
  try {
    payload = JSON.parse(result.stdout || "{}") as {
      dependencies?: Record<string, { version?: string; path?: string }>;
    };
  } catch {
    payload = {};
  }

  // npm list --json 返回的 dependencies key 不含版本号，但 distribution.package 可能带版本后缀（如 @scope/pkg@1.0.0）
  const dependency = payload.dependencies?.[barePackageName];

  if (!dependency) {
    return { installed: false, installMethod: "npx" };
  }

  return {
    installed: true,
    installMethod: "npx",
    detectedVersion: normalizeVersion(dependency.version),
    installPath: dependency.path,
  };
}

async function detectUvxInstallation(agent: AcpAgentEntry): Promise<DetectedInstallation> {
  const distribution = agent.distribution.uvx;
  if (!distribution) {
    return { installed: false };
  }

  const uvPath = await findCommandPath("uv");
  if (!uvPath) {
    return { installed: false, installMethod: "uvx" };
  }

  const result = await runCommand(uvPath, ["tool", "list"]);
  if (result.code !== 0) {
    return { installed: false, installMethod: "uvx" };
  }

  const line = result.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(
      (item) => item.startsWith(`${distribution.package} `) || item.includes(distribution.package)
    );

  if (!line) {
    return { installed: false, installMethod: "uvx" };
  }

  return {
    installed: true,
    installMethod: "uvx",
    detectedVersion: parseVersionFromText(line),
  };
}

async function detectBinaryInstallation(
  agent: AcpAgentEntry,
  record?: AcpInstalledRecord
): Promise<DetectedInstallation> {
  const binary = resolveBinaryDistribution(agent.distribution.binary);
  if (!binary) {
    return { installed: false, installMethod: "binary" };
  }

  if (await pathExists(record?.installPath)) {
    return {
      installed: true,
      installMethod: "binary",
      detectedVersion:
        (await tryReadCommandVersion(record?.installPath as string)) ?? record?.installedVersion,
      installPath: record?.installPath,
    };
  }

  const binaryPath = await findCommandPath(binary.cmd);
  if (!(await pathExists(binaryPath ?? undefined))) {
    return { installed: false, installMethod: "binary" };
  }

  return {
    installed: true,
    installMethod: "binary",
    detectedVersion:
      (await tryReadCommandVersion(binaryPath as string)) ?? record?.installedVersion,
    installPath: binaryPath as string,
  };
}

export async function detectAgentInstallation(
  agent: AcpAgentEntry,
  record?: AcpInstalledRecord
): Promise<DetectedInstallation> {
  let detection: DetectedInstallation;

  if (agent.distribution.npx) {
    detection = await detectNpxInstallation(agent);
  } else if (agent.distribution.uvx) {
    detection = await detectUvxInstallation(agent);
  } else {
    return detectBinaryInstallation(agent, record);
  }

  // 系统检测失败但 installed.json 有 fyllocode 管理的记录时，信任记录（可能是 npm 环境不一致）
  // user 管理的记录不做 fallback：检测不到即视为已卸载
  if (!detection.installed && record?.managedBy === "fyllocode") {
    return {
      installed: true,
      installMethod: record.installMethod,
      detectedVersion: record.installedVersion,
      installPath: record.installPath,
    };
  }

  return detection;
}

export async function detectAgentStatuses(registry: {
  agents: AcpAgentEntry[];
}): Promise<AcpAgentStatus[]> {
  const records = await readInstalledRecords();
  let shouldPersist = false;

  const statuses = await Promise.all(
    registry.agents.map(async (agent) => {
      const existingRecord = records[agent.id];
      const detection = await detectAgentInstallation(agent, existingRecord);

      if (!detection.installed) {
        // 检测不到但 installed.json 有记录，说明用户已卸载，清除记录
        if (existingRecord) {
          delete records[agent.id];
          shouldPersist = true;
        }
        return {
          id: agent.id,
          installed: false,
          managedBy: null,
          updateAvailable: false,
          latestVersion: agent.version,
        } satisfies AcpAgentStatus;
      }

      const managedBy = existingRecord?.managedBy ?? "user";
      const installedVersion = detection.detectedVersion ?? existingRecord?.installedVersion;
      const installMethod =
        detection.installMethod ??
        existingRecord?.installMethod ??
        inferInstallMethod(agent.distribution);
      const installPath = detection.installPath ?? existingRecord?.installPath;
      const nextRecord: AcpInstalledRecord = {
        managedBy,
        installMethod,
        installPath,
        installedVersion,
        installedAt: existingRecord?.installedAt ?? Date.now(),
      };

      if (
        !existingRecord ||
        existingRecord.managedBy !== nextRecord.managedBy ||
        existingRecord.installMethod !== nextRecord.installMethod ||
        existingRecord.installPath !== nextRecord.installPath ||
        existingRecord.installedVersion !== nextRecord.installedVersion
      ) {
        records[agent.id] = nextRecord;
        shouldPersist = true;
      }

      return {
        id: agent.id,
        installed: true,
        detectedVersion: installedVersion,
        managedBy,
        updateAvailable: installedVersion
          ? compareVersions(agent.version, installedVersion) > 0
          : false,
        latestVersion: agent.version,
      } satisfies AcpAgentStatus;
    })
  );

  if (shouldPersist) {
    await writeInstalledRecords(records);
  }

  return statuses;
}
