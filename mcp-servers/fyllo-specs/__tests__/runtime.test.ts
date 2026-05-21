import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { wrapState } from "../src/utils/state";
import { finalizeArchiveWorkspace } from "../src/runtime-workspace";

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
}

function createGitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "fyllo-workspace-runtime-"));
  git(root, ["init"]);
  git(root, ["config", "user.name", "Fyllo Test"]);
  git(root, ["config", "user.email", "test@example.com"]);
  writeFileSync(join(root, "README.md"), "initial\n", "utf8");
  writeFileSync(join(root, ".gitignore"), ".worktrees/\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "chore(test): initial"]);
  return root;
}

describe("fyllo-specs runtime", () => {
  it("wraps prompt and state", () => {
    const text = wrapState("prompt", { ok: true });
    expect(text).toContain("<tool_instruction>");
    expect(text).toContain("<state>");
  });

  it("finalizes main workspace with commit only", async () => {
    const root = createGitRepo();
    writeFileSync(join(root, "CHANGE.md"), "archived\n", "utf8");

    const result = await finalizeArchiveWorkspace({
      mainProjectPath: root,
      workspacePath: root,
      changeName: "sample-change",
      commitMessage: "chore(specs): archive sample change",
    });

    expect(result.mode).toBe("main");
    expect(result.ok).toBe(true);
    expect(result.failedStep).toBeNull();
    expect(result.gitOps.map((op) => op.step)).toEqual(["commit"]);
    expect(result.gitOps[0].outcome).toBe("created");
    expect(result.recovery?.required).toBe("none");
  });

  it("finalizes main workspace with no-op commit when there is no diff", async () => {
    const root = createGitRepo();

    const result = await finalizeArchiveWorkspace({
      mainProjectPath: root,
      workspacePath: root,
      changeName: "sample-change",
      commitMessage: "chore(specs): archive sample change",
    });

    expect(result.mode).toBe("main");
    expect(result.ok).toBe(true);
    expect(result.failedStep).toBeNull();
    expect(result.gitOps.map((op) => op.step)).toEqual(["commit"]);
    expect(result.gitOps[0].ok).toBe(true);
    expect(result.gitOps[0].outcome).toBe("noop");
    expect(result.recovery?.required).toBe("none");
  });

  it("finalizes linked workspace through all git steps", async () => {
    const root = createGitRepo();
    const workspacePath = join(root, ".worktrees", "sample-change");
    mkdirSync(join(root, ".worktrees"), { recursive: true });
    git(root, ["worktree", "add", workspacePath, "-b", "proposal/sample-change"]);
    writeFileSync(join(workspacePath, "CHANGE.md"), "archived\n", "utf8");

    const result = await finalizeArchiveWorkspace({
      mainProjectPath: root,
      workspacePath,
      changeName: "sample-change",
      commitMessage: "chore(specs): archive sample change",
    });

    expect(result.mode).toBe("linked");
    expect(result.ok).toBe(true);
    expect(result.failedStep).toBeNull();
    expect(result.gitOps.map((op) => op.step)).toEqual([
      "commit",
      "merge-to-main",
      "worktree-remove",
      "branch-delete",
    ]);
    expect(result.gitOps[0].outcome).toBe("created");
    expect(result.recovery?.required).toBe("none");
    expect(existsSync(workspacePath)).toBe(false);
  });

  it("rebases linked workspace after non-fast-forward merge and completes cleanup", async () => {
    const root = createGitRepo();
    const workspacePath = join(root, ".worktrees", "sample-change");
    mkdirSync(join(root, ".worktrees"), { recursive: true });
    git(root, ["worktree", "add", workspacePath, "-b", "proposal/sample-change"]);
    writeFileSync(join(root, "MAIN.md"), "main changed\n", "utf8");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "chore(test): move main"]);
    writeFileSync(join(workspacePath, "CHANGE.md"), "archived\n", "utf8");

    const result = await finalizeArchiveWorkspace({
      mainProjectPath: root,
      workspacePath,
      changeName: "sample-change",
      commitMessage: "chore(specs): archive sample change",
    });

    expect(result.ok).toBe(true);
    expect(result.failedStep).toBeNull();
    expect(result.gitOps.map((op) => op.step)).toEqual([
      "commit",
      "merge-to-main",
      "rebase-onto-main",
      "merge-to-main-retry",
      "worktree-remove",
      "branch-delete",
    ]);
    expect(result.gitOps[1].ok).toBe(false);
    expect(result.gitOps[2].ok).toBe(true);
    expect(result.gitOps[3].ok).toBe(true);
    expect(result.recovery?.required).toBe("none");
    expect(existsSync(workspacePath)).toBe(false);
  });

  it("returns agent recovery when automatic rebase conflicts", async () => {
    const root = createGitRepo();
    writeFileSync(join(root, "CONFLICT.md"), "base\n", "utf8");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "chore(test): add conflict base"]);
    const workspacePath = join(root, ".worktrees", "sample-change");
    mkdirSync(join(root, ".worktrees"), { recursive: true });
    git(root, ["worktree", "add", workspacePath, "-b", "proposal/sample-change"]);
    writeFileSync(join(root, "CONFLICT.md"), "main\n", "utf8");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "chore(test): change main"]);
    writeFileSync(join(workspacePath, "CONFLICT.md"), "proposal\n", "utf8");

    const result = await finalizeArchiveWorkspace({
      mainProjectPath: root,
      workspacePath,
      changeName: "sample-change",
      commitMessage: "chore(specs): archive sample change",
    });

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("rebase-onto-main");
    expect(result.gitOps.map((op) => op.step)).toEqual([
      "commit",
      "merge-to-main",
      "rebase-onto-main",
    ]);
    expect(result.recovery?.required).toBe("agent");
    expect(result.recovery?.kind).toBe("rebase-conflict");
    expect(result.recovery?.remainingSteps).toEqual([
      "resolve-or-abort-rebase",
      "merge-to-main-retry",
      "worktree-remove",
      "branch-delete",
    ]);
  });

  it("returns dirty-workspace recovery without rebase when main is dirty", async () => {
    const root = createGitRepo();
    const workspacePath = join(root, ".worktrees", "sample-change");
    mkdirSync(join(root, ".worktrees"), { recursive: true });
    git(root, ["worktree", "add", workspacePath, "-b", "proposal/sample-change"]);
    writeFileSync(join(root, "MAIN.md"), "main changed\n", "utf8");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "chore(test): move main"]);
    writeFileSync(join(root, "DIRTY.md"), "dirty\n", "utf8");
    writeFileSync(join(workspacePath, "CHANGE.md"), "archived\n", "utf8");

    const result = await finalizeArchiveWorkspace({
      mainProjectPath: root,
      workspacePath,
      changeName: "sample-change",
      commitMessage: "chore(specs): archive sample change",
    });

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("merge-to-main");
    expect(result.gitOps.map((op) => op.step)).toEqual(["commit", "merge-to-main"]);
    expect(result.recovery?.required).toBe("agent");
    expect(result.recovery?.kind).toBe("dirty-workspace");
    expect(result.error?.retryHint).toContain("Protect and clean");
  });
});
