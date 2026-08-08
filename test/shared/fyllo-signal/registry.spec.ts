import { describe, expect, it } from "vitest";
import {
  enabledFylloSignalTypes,
  fylloSignalContracts,
  getFylloSignalContract,
} from "@shared/fyllo-signal/registry";
import type { FylloSignalType } from "@shared/fyllo-signal/protocol";

describe("fylloSignalContracts", () => {
  it("exhaustively exposes every enabled signal type", () => {
    const expected = ["show.time", "spawn.session"] satisfies FylloSignalType[];
    expect(enabledFylloSignalTypes).toEqual(expected);
    expect(Object.keys(fylloSignalContracts)).toEqual(expected);
  });

  it("looks up enabled types and rejects unknown types", () => {
    expect(getFylloSignalContract("show.time")?.type).toBe("show.time");
    expect(getFylloSignalContract("spawn.session")?.type).toBe("spawn.session");
    expect(getFylloSignalContract("show.weather")).toBeUndefined();
  });

  it("keeps spawn.session as an opaque, side-effect-free query pointer", () => {
    const contract = fylloSignalContracts["spawn.session"];
    expect(contract.prompt.payloadFields.map((field) => field.name)).toEqual(["sessionId"]);
    expect(contract.prompt.constraints.join(" ")).toContain("synchronous and background");
    expect(contract.prompt.constraints.join(" ")).toContain("continuation");
    expect(contract.prompt.constraints.join(" ")).toContain("does not create");
  });
});
