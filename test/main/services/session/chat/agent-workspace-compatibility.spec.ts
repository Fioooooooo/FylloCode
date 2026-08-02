import { describe, expect, it, vi } from "vitest";
import { assertAgentWorkspaceCompatibility } from "@main/services/session/chat/agent-workspace-compatibility";
import { IpcErrorCodes } from "@shared/constants/error-codes";

function snapshot(additionalDirectories: string[]) {
  return { workspaceId: "workspace-1", additionalDirectories };
}

describe("assertAgentWorkspaceCompatibility", () => {
  it("does not inspect the marker for a single-root snapshot", async () => {
    const ensureAgent = vi.fn();

    await expect(
      assertAgentWorkspaceCompatibility("agent-1", snapshot([]), { ensureAgent })
    ).resolves.toBeUndefined();
    expect(ensureAgent).not.toHaveBeenCalled();
  });

  it("allows a complete snapshot with the additionalDirectories marker", async () => {
    const ensureAgent = vi.fn().mockResolvedValue({
      sessionCapabilities: { additionalDirectories: {} },
      capabilityCompleteness: "complete",
      capturedAgentVersion: "1.0.0",
      capturedAt: "2026-08-02T00:00:00.000Z",
    });

    await expect(
      assertAgentWorkspaceCompatibility("agent-1", snapshot(["/tmp/secondary"]), {
        ensureAgent,
      })
    ).resolves.toBeUndefined();
  });

  it.each([
    ["unsupported", { capabilityCompleteness: "complete" }],
    ["unknown", { capabilityCompleteness: "partial" }],
  ] as const)("rejects %s multi-root capability", async (capability, partial) => {
    const ensureAgent = vi.fn().mockResolvedValue({
      ...partial,
      capturedAgentVersion: "1.0.0",
      capturedAt: "2026-08-02T00:00:00.000Z",
    });

    await expect(
      assertAgentWorkspaceCompatibility("agent-1", snapshot(["/tmp/secondary"]), {
        ensureAgent,
      })
    ).rejects.toMatchObject({
      code: IpcErrorCodes.PROMPT_CAPABILITY_MISMATCH,
      details: { capability },
    });
  });
});
