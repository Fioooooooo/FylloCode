import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, existsSync } from "fs";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { tmpdir } from "os";
import { net } from "electron";
import type { AcpAgentEntry } from "@shared/types/acp-agent";
import { resetLifecycleForTests } from "@main/bootstrap/lifecycle";

const mocks = vi.hoisted(() => ({
  getDataSubPath: vi.fn(),
  findCommandPath: vi.fn(),
  detectAgentInstallation: vi.fn(),
  readInstalledRecords: vi.fn(async () => ({})),
  writeInstalledRecords: vi.fn(async () => undefined),
  resolveBinaryDistribution: vi.fn(),
  decompressArchive: vi.fn(),
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
  writeInstalledRecords: mocks.writeInstalledRecords,
}));

vi.mock("cross-spawn", () => ({
  default: mocks.spawn,
}));

vi.mock("@main/infra/archive/decompress", () => ({
  decompressArchive: mocks.decompressArchive,
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

function mockSpawnResult(
  code: number,
  stdout = "",
  stderr = "",
  onSpawn?: (command: string, args: string[]) => Promise<void> | void
): void {
  mocks.spawn.mockImplementation((command: string, args: string[]) => {
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
          queueMicrotask(() => {
            void Promise.resolve(onSpawn?.(command, args)).then(() => cb(code));
          });
        }
      }),
    };
    return child;
  });
}

let dataRoot: string;

function createBinaryAgent(
  archive: string,
  overrides: Partial<NonNullable<AcpAgentEntry["distribution"]["binary"]>[string]> = {}
): AcpAgentEntry {
  return createAgent({
    distribution: {
      binary: {
        darwin: { archive, cmd: "claude", ...overrides },
      },
    },
  });
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function finalDirectoryFor(agentId = "claude-code"): string {
  return join(dataRoot, "bin", agentId);
}

async function createExistingBinaryInstall(): Promise<{
  finalDirectory: string;
  installedRecord: Record<string, unknown>;
}> {
  const finalDirectory = finalDirectoryFor();
  const installedRecord = {
    managedBy: "fyllocode",
    installMethod: "binary",
    installPath: join(finalDirectory, "claude"),
    installedVersion: "0.9.0",
    installedAt: "2026-01-01T00:00:00.000Z",
  };
  await fs.mkdir(finalDirectory, { recursive: true });
  await fs.writeFile(join(finalDirectory, "claude"), "old executable", "utf8");
  await fs.writeFile(
    join(dataRoot, "installed.json"),
    JSON.stringify({ "claude-code": installedRecord })
  );
  mocks.readInstalledRecords.mockResolvedValue({ "claude-code": installedRecord });
  return { finalDirectory, installedRecord };
}

function mockBinaryDownload(payload: Buffer): void {
  vi.spyOn(net, "fetch").mockResolvedValue(
    new Response(payload as unknown as BodyInit) as unknown as Response
  );
}

describe("acp-agent installer uninstall", () => {
  beforeEach(() => {
    resetLifecycleForTests();
    vi.resetModules();
    vi.clearAllMocks();
    dataRoot = mkdtempSync(join(tmpdir(), "fyllocode-installer-test-"));
    mocks.getDataSubPath.mockReturnValue(dataRoot);
    mocks.detectAgentInstallation.mockImplementation(async (_agent, record) => ({
      detectedVersion: record?.installedVersion,
      installPath: record?.installPath,
    }));
    mocks.readInstalledRecords.mockResolvedValue({});
    mocks.writeInstalledRecords.mockResolvedValue(undefined);
    mocks.resolveBinaryDistribution.mockImplementation((distributions) => {
      const entries = Object.values(distributions ?? {});
      return entries[0] ?? null;
    });
    mocks.decompressArchive.mockImplementation(
      async (_archivePath: string, targetDirectory: string) => {
        await fs.writeFile(join(targetDirectory, "claude"), "#!/bin/sh\necho ok", "utf8");
      }
    );
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it("normalizes an interrupted binary response stream as a download failure", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
      code: 20,
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.error(abortError);
      },
    });
    vi.spyOn(net, "fetch").mockResolvedValue(new Response(body) as unknown as Response);

    const { installAgent } = await import("@main/services/platform/acp-agent/installer");
    await expect(
      installAgent(
        createAgent({
          distribution: { binary: { darwin: { archive: "https://x/a.zip", cmd: "claude" } } },
        }),
        vi.fn()
      )
    ).rejects.toMatchObject({
      code: "DOWNLOAD_FAILED",
      message: "下载失败，请重试",
    });
  });

  it("allows an active binary download to run beyond 60 seconds", async () => {
    vi.useFakeTimers();
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    vi.spyOn(net, "fetch").mockResolvedValue(new Response(body) as unknown as Response);

    const { installAgent } = await import("@main/services/platform/acp-agent/installer");
    const installPromise = installAgent(
      createAgent({
        distribution: { binary: { darwin: { archive: "https://x/a.tar.gz", cmd: "claude" } } },
      }),
      vi.fn()
    );

    await vi.waitFor(() => expect(net.fetch).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(50_000);
    streamController?.enqueue(new Uint8Array([1, 2, 3]));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(50_000);
    streamController?.close();

    await expect(installPromise).resolves.toMatchObject({ installMethod: "binary" });
  });

  it("aborts a binary download after 60 seconds without response data", async () => {
    vi.useFakeTimers();
    let markFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    vi.spyOn(net, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          markFetchStarted?.();
          init?.signal?.addEventListener(
            "abort",
            () => {
              reject(
                Object.assign(new Error("The operation was aborted"), {
                  name: "AbortError",
                  code: 20,
                })
              );
            },
            { once: true }
          );
        })
    );

    const { installAgent } = await import("@main/services/platform/acp-agent/installer");
    const installPromise = installAgent(
      createAgent({
        distribution: { binary: { darwin: { archive: "https://x/a.zip", cmd: "claude" } } },
      }),
      vi.fn()
    );
    const rejection = expect(installPromise).rejects.toMatchObject({
      code: "DOWNLOAD_FAILED",
      message: "下载失败，请重试",
    });

    await fetchStarted;
    await vi.advanceTimersByTimeAsync(60_000);
    await rejection;
  });

  it("rejects a binary archive that extracts a path escaping the extraction dir", async () => {
    vi.spyOn(net, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]).buffer) as unknown as Response
    );
    // Emulate a malicious archive: a symlink pointing outside the extraction dir.
    const escapeTarget = join(dataRoot, "escape-target.txt");
    await fs.writeFile(escapeTarget, "secret", "utf8");
    mocks.decompressArchive.mockImplementationOnce(
      async (_archivePath: string, targetDirectory: string) => {
        await fs.symlink(escapeTarget, join(targetDirectory, "claude"));
      }
    );

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

  it("aborts an active net.fetch operation during shutdown", async () => {
    let observedSignal: AbortSignal | undefined;
    vi.spyOn(net, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          observedSignal = init?.signal ?? undefined;
          observedSignal?.addEventListener(
            "abort",
            () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            { once: true }
          );
        })
    );
    const { awaitActiveAgentOperations, installAgent } =
      await import("@main/services/platform/acp-agent/installer");
    const installPromise = installAgent(
      createAgent({
        distribution: { binary: { darwin: { archive: "https://x/a.zip", cmd: "claude" } } },
      }),
      vi.fn()
    );

    await vi.waitFor(() => expect(observedSignal).toBeDefined());
    const settling = awaitActiveAgentOperations();

    expect(observedSignal?.aborted).toBe(true);
    await expect(installPromise).rejects.toMatchObject({ code: "DOWNLOAD_FAILED" });
    await expect(settling).resolves.toBeUndefined();
  });

  it("accepts a matching lowercase or uppercase SHA-256 digest before extraction", async () => {
    const payload = Buffer.from("archive payload");
    mockBinaryDownload(payload);
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      installAgent(
        createBinaryAgent("https://x/goose.zip", { sha256: sha256(payload).toUpperCase() }),
        vi.fn()
      )
    ).resolves.toMatchObject({ installMethod: "binary" });
    expect(mocks.decompressArchive).toHaveBeenCalledOnce();
  });

  it("continues without a digest when binary.sha256 is missing", async () => {
    const payload = Buffer.from("archive payload");
    mockBinaryDownload(payload);
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    const record = await installAgent(createBinaryAgent("https://x/goose.tgz"), vi.fn());

    expect(record).not.toHaveProperty("sha256");
    expect(mocks.decompressArchive).toHaveBeenCalledOnce();
  });

  it("rejects an invalid digest before downloading", async () => {
    const { finalDirectory } = await createExistingBinaryInstall();
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      installAgent(createBinaryAgent("https://x/goose.zip", { sha256: "not-a-sha" }), vi.fn())
    ).rejects.toMatchObject({ code: "INSTALL_FAILED" });

    expect(net.fetch).not.toHaveBeenCalled();
    expect(mocks.decompressArchive).not.toHaveBeenCalled();
    await expect(fs.readFile(join(finalDirectory, "claude"), "utf8")).resolves.toBe(
      "old executable"
    );
  });

  it("preserves an existing install and record when the digest does not match", async () => {
    const { finalDirectory, installedRecord } = await createExistingBinaryInstall();
    const payload = Buffer.from("archive payload");
    mockBinaryDownload(payload);
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      installAgent(
        createBinaryAgent("https://x/goose.zip", { sha256: sha256(Buffer.from("different")) }),
        vi.fn()
      )
    ).rejects.toMatchObject({ code: "INSTALL_FAILED" });

    await expect(fs.readFile(join(finalDirectory, "claude"), "utf8")).resolves.toBe(
      "old executable"
    );
    expect(JSON.parse(await fs.readFile(join(dataRoot, "installed.json"), "utf8"))).toEqual({
      "claude-code": installedRecord,
    });
    expect(mocks.decompressArchive).not.toHaveBeenCalled();
    expect(mocks.writeInstalledRecords).not.toHaveBeenCalled();
  });

  it.each([".tar.bz2", ".zip", ".tgz"])(
    "routes %s archives through the shared decompressor",
    async (extension) => {
      const payload = Buffer.from("archive payload");
      mockBinaryDownload(payload);
      const { installAgent } = await import("@main/services/platform/acp-agent/installer");

      await expect(
        installAgent(createBinaryAgent(`https://x/goose${extension}`), vi.fn())
      ).resolves.toMatchObject({ installMethod: "binary" });

      expect(mocks.decompressArchive).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`${extension.replace(".", "\\.")}$`)),
        expect.any(String)
      );
    }
  );

  it("preserves the old install when decompression rejects a corrupt archive", async () => {
    const { finalDirectory } = await createExistingBinaryInstall();
    mockBinaryDownload(Buffer.from("corrupt archive"));
    mocks.decompressArchive.mockRejectedValueOnce(new Error("broken archive"));
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      installAgent(createBinaryAgent("https://x/goose.tar.bz2"), vi.fn())
    ).rejects.toMatchObject({ code: "INSTALL_FAILED" });

    await expect(fs.readFile(join(finalDirectory, "claude"), "utf8")).resolves.toBe(
      "old executable"
    );
    expect(mocks.writeInstalledRecords).not.toHaveBeenCalled();
  });

  it("restores the old install when staging copy fails", async () => {
    const { finalDirectory } = await createExistingBinaryInstall();
    mockBinaryDownload(Buffer.from("archive payload"));
    vi.spyOn(fs, "cp").mockRejectedValueOnce(new Error("staging copy failed"));
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      installAgent(createBinaryAgent("https://x/goose.zip"), vi.fn())
    ).rejects.toMatchObject({
      code: "INSTALL_FAILED",
    });
    await expect(fs.readFile(join(finalDirectory, "claude"), "utf8")).resolves.toBe(
      "old executable"
    );
  });

  it("restores the old install when final-directory rename fails", async () => {
    const { finalDirectory } = await createExistingBinaryInstall();
    mockBinaryDownload(Buffer.from("archive payload"));
    const realRename = fs.rename.bind(fs);
    let renameCount = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      renameCount += 1;
      if (renameCount === 2) {
        throw new Error("final rename failed");
      }
      await realRename(from, to);
    });
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      installAgent(createBinaryAgent("https://x/goose.zip"), vi.fn())
    ).rejects.toMatchObject({
      code: "INSTALL_FAILED",
    });
    await expect(fs.readFile(join(finalDirectory, "claude"), "utf8")).resolves.toBe(
      "old executable"
    );
  });

  it("restores the old install when permission handling fails", async () => {
    const { finalDirectory } = await createExistingBinaryInstall();
    mockBinaryDownload(Buffer.from("archive payload"));
    vi.spyOn(fs, "chmod").mockRejectedValueOnce(new Error("chmod failed"));
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      installAgent(createBinaryAgent("https://x/goose.zip"), vi.fn())
    ).rejects.toMatchObject({
      code: "INSTALL_FAILED",
    });
    await expect(fs.readFile(join(finalDirectory, "claude"), "utf8")).resolves.toBe(
      "old executable"
    );
  });

  it("restores the old install and record when installed record writing fails", async () => {
    const { finalDirectory, installedRecord } = await createExistingBinaryInstall();
    mockBinaryDownload(Buffer.from("archive payload"));
    mocks.writeInstalledRecords.mockRejectedValueOnce(new Error("record write failed"));
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      installAgent(createBinaryAgent("https://x/goose.zip"), vi.fn())
    ).rejects.toMatchObject({
      code: "INSTALL_FAILED",
    });
    await expect(fs.readFile(join(finalDirectory, "claude"), "utf8")).resolves.toBe(
      "old executable"
    );
    expect(JSON.parse(await fs.readFile(join(dataRoot, "installed.json"), "utf8"))).toEqual({
      "claude-code": installedRecord,
    });
  });

  it("leaves no final directory or installed record after a first-install commit failure", async () => {
    mockBinaryDownload(Buffer.from("archive payload"));
    mocks.writeInstalledRecords.mockRejectedValueOnce(new Error("record write failed"));
    const { installAgent } = await import("@main/services/platform/acp-agent/installer");

    await expect(
      installAgent(createBinaryAgent("https://x/goose.zip"), vi.fn())
    ).rejects.toMatchObject({
      code: "INSTALL_FAILED",
    });
    expect(existsSync(finalDirectoryFor())).toBe(false);
    expect(existsSync(join(dataRoot, "installed.json"))).toBe(false);
    const remainingEntries = await fs.readdir(dataRoot);
    expect(
      remainingEntries.some((entry) => entry.includes(".staging-") || entry.includes(".backup-"))
    ).toBe(false);
  });
});
