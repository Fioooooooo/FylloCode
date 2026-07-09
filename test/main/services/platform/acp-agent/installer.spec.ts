import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, existsSync } from "fs";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { net } from "electron";
import type { AcpAgentEntry } from "@shared/types/acp-agent";

const mocks = vi.hoisted(() => ({
  getDataSubPath: vi.fn(),
  findCommandPath: vi.fn(),
  detectAgentInstallation: vi.fn(),
  readInstalledRecords: vi.fn(async () => ({})),
  writeInstalledRecords: vi.fn(async () => undefined),
  resolveBinaryDistribution: vi.fn(),
  runCommand: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: mocks.getDataSubPath,
}));

vi.mock("@main/infra/acp/detector", () => ({
  detectAgentInstallation: mocks.detectAgentInstallation,
  findCommandPath: mocks.findCommandPath,
  readInstalledRecords: mocks.readInstalledRecords,
  resolveBinaryDistribution: mocks.resolveBinaryDistribution,
  runCommand: mocks.runCommand,
  writeInstalledRecords: mocks.writeInstalledRecords,
}));

vi.mock("cross-spawn", () => ({
  default: mocks.spawn,
}));

function createAgent(overrides: Partial<AcpAgentEntry> = {}): AcpAgentEntry {
  return {
    id: "claude-code",
    name: "Claude Code",
    version: "1.2.3",
    description: "ACP agent",
    authors: ["Anthropic"],
    license: "MIT",
    distribution: {
      npx: { package: "@anthropic/claude-code" },
    },
    ...overrides,
  };
}

function mockSpawnResult(code: number, stdout = "", stderr = ""): void {
  mocks.spawn.mockImplementation(() => {
    const listeners: Record<string, Array<(value?: unknown) => void>> = {};
    const child = {
      stdout: {
        on: vi.fn((event: string, cb: (chunk: Buffer | string) => void) => {
          if (event === "data" && stdout) {
            queueMicrotask(() => cb(stdout));
          }
        }),
      },
      stderr: {
        on: vi.fn((event: string, cb: (chunk: Buffer | string) => void) => {
          if (event === "data" && stderr) {
            queueMicrotask(() => cb(stderr));
          }
        }),
      },
      on: vi.fn((event: string, cb: (value?: unknown) => void) => {
        listeners[event] ??= [];
        listeners[event]!.push(cb);
        if (event === "close") {
          queueMicrotask(() => cb(code));
        }
      }),
    };
    return child;
  });
}

describe("acp-agent installer uninstall", () => {
  let dataRoot: string;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dataRoot = mkdtempSync(join(tmpdir(), "fyllocode-installer-test-"));
    mocks.getDataSubPath.mockReturnValue(dataRoot);
    mocks.detectAgentInstallation.mockImplementation(async (_agent, record) => ({
      detectedVersion: record?.installedVersion,
      installPath: record?.installPath,
    }));
    mocks.resolveBinaryDistribution.mockReturnValue({
      archive: "https://example.com/agent.tar.gz",
      cmd: "claude",
    });
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  it("uninstalls npx agents when npm exits successfully", async () => {
    mocks.findCommandPath.mockResolvedValue("/usr/bin/npm");
    mockSpawnResult(0);
    const { uninstallAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(uninstallAgent(createAgent(), "npx", vi.fn())).resolves.toBeUndefined();
    expect(mocks.spawn).toHaveBeenCalledWith(
      "/usr/bin/npm",
      ["uninstall", "-g", "@anthropic/claude-code"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });

  it("fails npx uninstall when npm exits non-zero", async () => {
    mocks.findCommandPath.mockResolvedValue("/usr/bin/npm");
    mockSpawnResult(1, "", "permission denied");
    const { uninstallAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(uninstallAgent(createAgent(), "npx", vi.fn())).rejects.toMatchObject({
      code: "UNINSTALL_FAILED",
    });
  });

  it("fails npx uninstall when npm is missing", async () => {
    mocks.findCommandPath.mockResolvedValue(null);
    const { uninstallAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(uninstallAgent(createAgent(), "npx", vi.fn())).rejects.toMatchObject({
      code: "ENV_MISSING",
      message: "需要先安装 Node.js",
    });
  });

  it("uninstalls uvx agents when uv exits successfully", async () => {
    mocks.findCommandPath.mockResolvedValue("/usr/bin/uv");
    mockSpawnResult(0);
    const { uninstallAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      uninstallAgent(
        createAgent({ distribution: { uvx: { package: "@openai/codex" } } }),
        "uvx",
        vi.fn()
      )
    ).resolves.toBeUndefined();
    expect(mocks.spawn).toHaveBeenCalledWith(
      "/usr/bin/uv",
      ["tool", "uninstall", "@openai/codex"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });

  it("fails uvx uninstall when uv exits non-zero", async () => {
    mocks.findCommandPath.mockResolvedValue("/usr/bin/uv");
    mockSpawnResult(2, "", "tool not found");
    const { uninstallAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      uninstallAgent(
        createAgent({ distribution: { uvx: { package: "@openai/codex" } } }),
        "uvx",
        vi.fn()
      )
    ).rejects.toMatchObject({ code: "UNINSTALL_FAILED" });
  });

  it("fails uvx uninstall when uv is missing", async () => {
    mocks.findCommandPath.mockResolvedValue(null);
    const { uninstallAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      uninstallAgent(
        createAgent({ distribution: { uvx: { package: "@openai/codex" } } }),
        "uvx",
        vi.fn()
      )
    ).rejects.toMatchObject({ code: "ENV_MISSING", message: "需要先安装 uv" });
  });

  it("removes binary install directories", async () => {
    const targetDir = join(dataRoot, "bin", "claude-code");
    mkdirSync(targetDir, { recursive: true });
    await fs.writeFile(join(targetDir, "claude"), "echo ok", "utf8");
    const { uninstallAgent } = await import("@main/services/platform/acp-agent/installer");

    await uninstallAgent(
      createAgent({ distribution: { binary: { darwin: { archive: "x", cmd: "claude" } } } }),
      "binary",
      vi.fn()
    );

    expect(existsSync(targetDir)).toBe(false);
  });

  it("treats missing binary directories as success", async () => {
    const { uninstallAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      uninstallAgent(
        createAgent({ distribution: { binary: { darwin: { archive: "x", cmd: "claude" } } } }),
        "binary",
        vi.fn()
      )
    ).resolves.toBeUndefined();
  });

  it("rejects invalid binary agent ids before touching the filesystem", async () => {
    const { uninstallAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      uninstallAgent(
        createAgent({
          id: "../etc",
          distribution: { binary: { darwin: { archive: "x", cmd: "claude" } } },
        }),
        "binary",
        vi.fn()
      )
    ).rejects.toMatchObject({ code: "INVALID_AGENT_ID" });
    expect(existsSync(join(dataRoot, "bin", "../etc"))).toBe(false);
  });

  it("accepts a binary archive whose contents stay inside the extraction dir", async () => {
    vi.spyOn(net, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]).buffer) as unknown as Response
    );
    mocks.findCommandPath.mockResolvedValue("/usr/bin/tar");
    // Emulate extraction: write a normal executable inside the target dir.
    mocks.runCommand.mockImplementation(async (_cmd: string, args: string[]) => {
      const dir = args[args.indexOf("-C") + 1];
      await fs.writeFile(join(dir, "claude"), "#!/bin/sh\necho ok", "utf8");
      return { stdout: "", stderr: "", code: 0 };
    });

    const { installAgent } = await import("@main/services/platform/acp-agent/installer");
    await expect(
      installAgent(
        createAgent({
          distribution: { binary: { darwin: { archive: "https://x/a.tar.gz", cmd: "claude" } } },
        }),
        vi.fn()
      )
    ).resolves.toMatchObject({ installMethod: "binary" });
  });

  it("rejects a binary archive that extracts a path escaping the extraction dir", async () => {
    vi.spyOn(net, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]).buffer) as unknown as Response
    );
    mocks.findCommandPath.mockResolvedValue("/usr/bin/tar");
    // Emulate a malicious archive: a symlink pointing outside the extraction dir.
    const escapeTarget = join(dataRoot, "escape-target.txt");
    await fs.writeFile(escapeTarget, "secret", "utf8");
    mocks.runCommand.mockImplementation(async (_cmd: string, args: string[]) => {
      const dir = args[args.indexOf("-C") + 1];
      await fs.symlink(escapeTarget, join(dir, "claude"));
      return { stdout: "", stderr: "", code: 0 };
    });

    const { installAgent } = await import("@main/services/platform/acp-agent/installer");
    await expect(
      installAgent(
        createAgent({
          distribution: { binary: { darwin: { archive: "https://x/a.tar.gz", cmd: "claude" } } },
        }),
        vi.fn()
      )
    ).rejects.toMatchObject({ code: "INSTALL_FAILED" });
  });

  it("uses the shared mutation lock across install and uninstall", async () => {
    mocks.findCommandPath.mockResolvedValue("/usr/bin/npm");
    let releaseInstall: (() => void) | null = null;
    mocks.spawn.mockImplementationOnce(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (value?: unknown) => void) => {
        if (event === "close") {
          releaseInstall = () => cb(0);
        }
      }),
    }));

    const { installAgent, uninstallAgent } =
      await import("@main/services/platform/acp-agent/installer");
    const installPromise = installAgent(createAgent(), vi.fn());

    await expect(uninstallAgent(createAgent(), "npx", vi.fn())).rejects.toMatchObject({
      code: "INSTALL_BUSY",
    });

    (releaseInstall as (() => void) | null)?.();
    await installPromise;
  });
});
