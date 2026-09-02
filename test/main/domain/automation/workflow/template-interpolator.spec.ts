import { describe, it, expect } from "vitest";
import { interpolateTemplate } from "@main/domain/automation/workflow/template-interpolator";

describe("interpolateTemplate", () => {
  describe("run.* namespace", () => {
    it("should interpolate run.id", () => {
      const result = interpolateTemplate("test-{{run.id}}.ts", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("test-run-abc123.ts");
    });

    it("should interpolate run.startedAt", () => {
      const result = interpolateTemplate("Started at {{run.startedAt}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("Started at 2026-09-02T00:00:00.000Z");
    });

    it("should handle multiple run.* references", () => {
      const result = interpolateTemplate("Run {{run.id}} started at {{run.startedAt}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("Run run-abc123 started at 2026-09-02T00:00:00.000Z");
    });
  });

  describe("artifacts.* namespace", () => {
    it("should interpolate artifacts reference", () => {
      const result = interpolateTemplate("Code: {{artifacts.code}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
        artifacts: { code: "function add() {}" },
      });
      expect(result).toBe("Code: function add() {}");
    });

    it("should handle nested artifact paths", () => {
      const result = interpolateTemplate("URL: {{artifacts.pr.url}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
        artifacts: { pr: { url: "https://github.com/org/repo/pull/123" } },
      });
      expect(result).toBe("URL: https://github.com/org/repo/pull/123");
    });

    it("should handle missing artifacts gracefully", () => {
      const result = interpolateTemplate("Code: {{artifacts.code}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("Code: {{artifacts.code}}");
    });
  });

  describe("whitespace handling", () => {
    it("should handle whitespace around template variables", () => {
      const result = interpolateTemplate("test-{{ run.id }}.ts", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("test-run-abc123.ts");
    });

    it("should handle extra whitespace", () => {
      const result = interpolateTemplate("test-{{  run.id  }}.ts", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("test-run-abc123.ts");
    });
  });

  describe("filter syntax (ignored)", () => {
    it("should ignore filter syntax and interpolate value", () => {
      const result = interpolateTemplate("{{run.startedAt | date('YYYY-MM-DD')}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      // Phase 1 不实现 filter，直接返回原始值
      expect(result).toBe("2026-09-02T00:00:00.000Z");
    });
  });

  describe("edge cases", () => {
    it("should keep unknown namespace as-is", () => {
      const result = interpolateTemplate("{{task.id}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("{{task.id}}");
    });

    it("should keep non-existent path as-is", () => {
      const result = interpolateTemplate("{{run.nonExistent}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("{{run.nonExistent}}");
    });

    it("should handle empty string", () => {
      const result = interpolateTemplate("", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("");
    });

    it("should handle string without templates", () => {
      const result = interpolateTemplate("plain text", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
      });
      expect(result).toBe("plain text");
    });

    it("should handle number values", () => {
      const result = interpolateTemplate("Count: {{artifacts.count}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
        artifacts: { count: 42 },
      });
      expect(result).toBe("Count: 42");
    });

    it("should handle boolean values", () => {
      const result = interpolateTemplate("Success: {{artifacts.success}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
        artifacts: { success: true },
      });
      expect(result).toBe("Success: true");
    });

    it("should handle null/undefined as empty string", () => {
      const result = interpolateTemplate("Value: {{artifacts.empty}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
        artifacts: { empty: null },
      });
      expect(result).toBe("Value: ");
    });

    it("should keep complex objects as-is", () => {
      const result = interpolateTemplate("{{artifacts.complex}}", {
        run: { id: "run-abc123", startedAt: "2026-09-02T00:00:00.000Z" },
        artifacts: { complex: { nested: { value: "test" } } },
      });
      expect(result).toBe("{{artifacts.complex}}");
    });
  });

  describe("real-world scenarios", () => {
    it("should handle file path with run.id", () => {
      const result = interpolateTemplate("/tmp/fyllo-workflow-test-{{run.id}}.ts", {
        run: { id: "run-p0fCgyJpAi", startedAt: "2026-09-02T02:52:22.131Z" },
      });
      expect(result).toBe("/tmp/fyllo-workflow-test-run-p0fCgyJpAi.ts");
    });

    it("should handle command with run.id", () => {
      const result = interpolateTemplate("tsc --noEmit /tmp/test-{{run.id}}.ts", {
        run: { id: "run-p0fCgyJpAi", startedAt: "2026-09-02T02:52:22.131Z" },
      });
      expect(result).toBe("tsc --noEmit /tmp/test-run-p0fCgyJpAi.ts");
    });

    it("should handle console.log with run.id", () => {
      const result = interpolateTemplate("console.log('Test passed for run {{run.id}}')", {
        run: { id: "run-p0fCgyJpAi", startedAt: "2026-09-02T02:52:22.131Z" },
      });
      expect(result).toBe("console.log('Test passed for run run-p0fCgyJpAi')");
    });
  });
});
