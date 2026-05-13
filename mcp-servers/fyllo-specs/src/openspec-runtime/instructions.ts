import { resolveOpenspecCli } from "./resolve-cli";
import { spawnOpenspec } from "./spawner";
import type { InstructionPayload } from "./types";

export async function getInstructions(
  projectRoot: string,
  changeName: string,
  artifactId: string
): Promise<InstructionPayload> {
  const cliPath = resolveOpenspecCli();
  return (await spawnOpenspec(
    cliPath,
    ["instructions", artifactId, "--change", changeName, "--json"],
    projectRoot
  )) as InstructionPayload;
}
