import { describe, expect, it } from "vitest";
import {
  enabledFylloSignalTypes,
  fylloSignalContracts,
  getFylloSignalContract,
} from "@shared/fyllo-signal/registry";
import type { FylloSignalType } from "@shared/fyllo-signal/protocol";

describe("fylloSignalContracts", () => {
  it("exhaustively exposes every enabled signal type", () => {
    const expected = ["show.time"] satisfies FylloSignalType[];
    expect(enabledFylloSignalTypes).toEqual(expected);
    expect(Object.keys(fylloSignalContracts)).toEqual(expected);
  });

  it("looks up enabled types and rejects unknown types", () => {
    expect(getFylloSignalContract("show.time")?.type).toBe("show.time");
    expect(getFylloSignalContract("show.weather")).toBeUndefined();
  });
});
