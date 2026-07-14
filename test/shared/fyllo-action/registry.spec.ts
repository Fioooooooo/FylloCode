import { describe, expect, it } from "vitest";
import {
  enabledFylloActionTypes,
  fylloActionContracts,
  getFylloActionContract,
  isValidFylloActionTypeName,
} from "@shared/fyllo-action/registry";
import type { FylloActionType } from "@shared/fyllo-action/protocol";

describe("fyllo-action registry", () => {
  it("covers all FylloActionType values", () => {
    const allTypes: FylloActionType[] = [
      "task.create",
      "plan.create",
      "knowledge.flag",
      "knowledge.review",
    ];
    expect(enabledFylloActionTypes.sort()).toEqual(allTypes.sort());
    for (const type of allTypes) {
      expect(fylloActionContracts[type]).toBeDefined();
      expect(fylloActionContracts[type].type).toBe(type);
    }
  });

  it("returns contract for valid type", () => {
    const contract = getFylloActionContract("task.create");
    expect(contract).toBeDefined();
    expect(contract?.type).toBe("task.create");
    expect(contract?.presentation).toBe("inline");
    expect(contract?.interaction).toBe("confirm");
  });

  it("returns undefined for unknown type", () => {
    expect(getFylloActionContract("task.delete")).toBeUndefined();
  });

  it("validates action type names", () => {
    expect(isValidFylloActionTypeName("task.create")).toBe(true);
    expect(isValidFylloActionTypeName("knowledge.flag")).toBe(true);
    expect(isValidFylloActionTypeName("taskcreate")).toBe(false);
    expect(isValidFylloActionTypeName("Task.Create")).toBe(false);
    expect(isValidFylloActionTypeName("task.")).toBe(false);
  });
});
