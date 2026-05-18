import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { globSync } from "tinyglobby";
import { readYamlFile, writeYamlFile } from "./fs";
import { changeDir } from "./paths";
import type { ApplyStateResult, ArtifactStatus } from "./types";
import { computeStatus } from "./status";

export interface TaskLine {
  line: number;
  text: string;
  done: boolean;
}

function tasksPath(projectRoot: string, name: string): string {
  return join(changeDir(projectRoot, name), "tasks.md");
}

function yamlPath(projectRoot: string, name: string): string {
  return join(changeDir(projectRoot, name), ".openspec.yaml");
}

export function parseTaskCheckboxes(text: string): TaskLine[] {
  return text.split("\n").flatMap((line, index) => {
    const match = /^- \[( |x|X)\] (.+)$/.exec(line.trimEnd());
    if (!match) {
      return [];
    }
    return [
      {
        line: index + 1,
        done: match[1].toLowerCase() === "x",
        text: match[2],
      },
    ];
  });
}

function getApplyState(
  applyRequires: string[],
  artifacts: ArtifactStatus[],
  tasks: TaskLine[]
): "ready" | "blocked" | "all_done" {
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const isMissingRequiredArtifact = applyRequires.some((artifactId) => {
    const artifact = artifactById.get(artifactId);
    return !artifact || artifact.status !== "done";
  });

  if (isMissingRequiredArtifact) {
    return "blocked";
  }
  if (tasks.every((task) => task.done)) {
    return "all_done";
  }
  return "ready";
}

function expandArtifactFiles(
  projectRoot: string,
  changeName: string,
  outputPath: string
): string[] {
  const baseDir = changeDir(projectRoot, changeName);
  const matches = globSync(outputPath, {
    absolute: true,
    cwd: baseDir,
    onlyFiles: true,
    dot: true,
  });
  if (matches.length > 0) {
    return matches;
  }

  const absolute = join(baseDir, outputPath);
  return existsSync(absolute) ? [absolute] : [absolute];
}

export async function loadApplyState(
  projectRoot: string,
  changeName: string
): Promise<ApplyStateResult> {
  const tasksText = readFileSync(tasksPath(projectRoot, changeName), "utf8");
  const tasks = parseTaskCheckboxes(tasksText);
  const status = await computeStatus(projectRoot, changeName);
  const applyState = getApplyState(status.applyRequires, status.artifacts, tasks);
  const yamlPathValue = yamlPath(projectRoot, changeName);
  const doc = readYamlFile<Record<string, unknown>>(yamlPathValue) ?? {};

  if (doc.status !== "applying") {
    doc.status = "applying";
    writeYamlFile(yamlPathValue, doc);
  }

  const contextFiles = Object.fromEntries(
    status.artifacts.map((artifact) => [
      artifact.id,
      expandArtifactFiles(projectRoot, changeName, artifact.outputPath),
    ])
  );

  return {
    changeName,
    schemaName: status.schemaName,
    applyState,
    contextFiles,
    tasks,
    progress: {
      total: tasks.length,
      complete: tasks.filter((task) => task.done).length,
      remaining: tasks.filter((task) => !task.done).length,
    },
  };
}
