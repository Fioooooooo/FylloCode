import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { deflateRawSync, gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function writeTarField(target: Buffer, offset: number, length: number, value: number): void {
  target.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii");
}

function createTarArchive(filePath: string, content: Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(filePath, 0, "ascii");
  writeTarField(header, 100, 8, 0o755);
  writeTarField(header, 108, 8, 0);
  writeTarField(header, 116, 8, 0);
  writeTarField(header, 124, 12, content.length);
  writeTarField(header, 136, 12, 0);
  header[156] = 0x30;
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");

  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding, Buffer.alloc(1024)]);
}

function crc32(input: Buffer): number {
  let value = 0xffffffff;
  for (const byte of input) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function createZipArchive(filePath: string, content: Buffer): Buffer {
  const name = Buffer.from(filePath);
  const compressed = deflateRawSync(content);
  const checksum = crc32(content);

  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + compressed.length, 16);

  return Buffer.concat([local, compressed, central, end]);
}

const archiveContent = Buffer.from("hello from archive\n");
const tarArchive = createTarArchive("bin/agent", archiveContent);
const archiveCases = [
  { extension: "zip", data: createZipArchive("bin/agent", archiveContent) },
  { extension: "tar", data: tarArchive },
  { extension: "tar.gz", data: gzipSync(tarArchive) },
  { extension: "tgz", data: gzipSync(tarArchive) },
  {
    extension: "tar.bz2",
    data: Buffer.from(
      "QlpoOTFBWSZTWbMhlxoAAC5bgcqQQAD/gACAe+efAAABCAggAFRSNBkaAZqZGT1HpqCUiDEGgAA0BBvylAyMQJoPaPncxAUGS+IQrlEkUIYrQW6y52bwWupAA2jqCNsjEbolElKaxBHIzY9KfxdyRThQkLMhlxo=",
      "base64"
    ),
  },
  {
    extension: "tbz2",
    data: Buffer.from(
      "QlpoOTFBWSZTWbMhlxoAAC5bgcqQQAD/gACAe+efAAABCAggAFRSNBkaAZqZGT1HpqCUiDEGgAA0BBvylAyMQJoPaPncxAUGS+IQrlEkUIYrQW6y52bwWupAA2jqCNsjEbolElKaxBHIzY9KfxdyRThQkLMhlxo=",
      "base64"
    ),
  },
];

describe("decompressArchive", () => {
  let rootDirectory: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock("@xhmikosr/decompress");
    rootDirectory = await mkdtemp(join(tmpdir(), "fyllocode-decompress-test-"));
  });

  afterEach(async () => {
    vi.doUnmock("@xhmikosr/decompress");
    vi.resetModules();
    await fs.rm(rootDirectory, { recursive: true, force: true });
  });

  it.each(archiveCases)(
    "extracts .$extension without system archive tools",
    async ({ extension, data }) => {
      const archivePath = join(rootDirectory, `agent.${extension}`);
      const outputDirectory = join(rootDirectory, "output");
      await fs.writeFile(archivePath, data);

      const { decompressArchive } = await import("@main/infra/archive/decompress");
      await expect(decompressArchive(archivePath, outputDirectory)).resolves.toBeUndefined();
      await expect(fs.readFile(join(outputDirectory, "bin/agent"), "utf8")).resolves.toBe(
        archiveContent.toString()
      );
    }
  );

  it("rejects corrupt and unsupported input instead of treating it as a binary", async () => {
    const archivePath = join(rootDirectory, "agent.bin");
    const outputDirectory = join(rootDirectory, "output");
    await fs.writeFile(archivePath, Buffer.from("not an archive"));

    const { decompressArchive } = await import("@main/infra/archive/decompress");
    await expect(decompressArchive(archivePath, outputDirectory)).rejects.toThrow();
    await expect(fs.access(outputDirectory)).rejects.toThrow();
  });

  it("clears returned entry buffers and hides the third-party result", async () => {
    const entry = { data: Buffer.from("large entry") };
    const entries = [entry];
    const decompressMock = vi.fn().mockResolvedValue(entries);
    vi.resetModules();
    vi.doMock("@xhmikosr/decompress", () => ({ default: decompressMock }));

    const { decompressArchive } = await import("@main/infra/archive/decompress");
    await expect(decompressArchive("archive.zip", rootDirectory)).resolves.toBeUndefined();

    expect(decompressMock).toHaveBeenCalledWith("archive.zip", rootDirectory);
    expect(entry.data).toEqual(Buffer.alloc(0));
    expect(entries).toHaveLength(0);
  });

  it("propagates a decompressor error", async () => {
    const error = new Error("broken archive");
    const decompressMock = vi.fn().mockRejectedValue(error);
    vi.resetModules();
    vi.doMock("@xhmikosr/decompress", () => ({ default: decompressMock }));

    const { decompressArchive } = await import("@main/infra/archive/decompress");
    await expect(decompressArchive("archive.zip", rootDirectory)).rejects.toBe(error);
  });
});
