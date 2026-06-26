import { promises as fs } from "fs";
import type { Dirent } from "fs";
import { join } from "path";
import type {
  ProposalSpecDeltaItem,
  ProposalSpecDeltaOverview,
  ProposalSpecDeltaRequirementGroup,
  ProposalSpecDeltaScenarioGroup,
  ProposalSpecDeltaType,
} from "@shared/types/proposal";
import { resolveChangeDirAnywhere } from "@main/infra/proposal/openspec-reader";

type MutableRequirementGroup = Omit<ProposalSpecDeltaRequirementGroup, "body" | "scenarios"> & {
  bodyLines: string[];
  scenarios: MutableScenarioGroup[];
};

type MutableScenarioGroup = Omit<ProposalSpecDeltaScenarioGroup, "body"> & {
  bodyLines: string[];
};

type ParserSection = "none" | "purpose" | "requirement" | "scenario";

const deltaTypes: ProposalSpecDeltaType[] = ["ADDED", "MODIFIED", "REMOVED", "RENAMED"];
const purposeHeadingRegex = /^##\s+Purpose\s*:?$/i;
const deltaHeadingRegex = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i;
const requirementHeadingRegex = /^###\s+(?:Requirement|要求)\s*[:：]\s*(.+?)\s*$/i;
const scenarioHeadingRegex = /^####\s+(?:Scenario|场景)\s*[:：]\s*(.+?)\s*$/i;

function sourcePathFor(id: string): string {
  return ["specs", id, "spec.md"].join("/");
}

function trimMarkdown(lines: string[]): string {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end).join("\n");
}

function toRequirementGroup(group: MutableRequirementGroup): ProposalSpecDeltaRequirementGroup {
  return {
    deltaType: group.deltaType,
    title: group.title,
    body: trimMarkdown(group.bodyLines),
    scenarios: group.scenarios.map((scenario) => ({
      title: scenario.title,
      body: trimMarkdown(scenario.bodyLines),
    })),
  };
}

function orderedDeltaTypes(groups: ProposalSpecDeltaRequirementGroup[]): ProposalSpecDeltaType[] {
  const usedTypes = new Set(groups.map((group) => group.deltaType));
  return deltaTypes.filter((deltaType) => usedTypes.has(deltaType));
}

export function parseProposalSpecDeltaMarkdown(
  id: string,
  sourcePath: string,
  content: string
): ProposalSpecDeltaItem {
  const purposeLines: string[] = [];
  const requirementGroups: MutableRequirementGroup[] = [];
  let section: ParserSection = "none";
  let currentDeltaType: ProposalSpecDeltaType | null = null;
  let currentRequirement: MutableRequirementGroup | null = null;
  let currentScenario: MutableScenarioGroup | null = null;

  for (const line of content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if (/^#\s+/.test(line)) {
      continue;
    }

    if (purposeHeadingRegex.test(line)) {
      section = "purpose";
      currentDeltaType = null;
      currentRequirement = null;
      currentScenario = null;
      continue;
    }

    const deltaMatch = line.match(deltaHeadingRegex);
    if (deltaMatch) {
      currentDeltaType = deltaMatch[1].toUpperCase() as ProposalSpecDeltaType;
      section = "none";
      currentRequirement = null;
      currentScenario = null;
      continue;
    }

    const requirementMatch = line.match(requirementHeadingRegex);
    if (requirementMatch) {
      if (!currentDeltaType) {
        section = "none";
        currentRequirement = null;
        currentScenario = null;
        continue;
      }

      currentRequirement = {
        deltaType: currentDeltaType,
        title: requirementMatch[1],
        bodyLines: [],
        scenarios: [],
      };
      requirementGroups.push(currentRequirement);
      currentScenario = null;
      section = "requirement";
      continue;
    }

    const scenarioMatch = line.match(scenarioHeadingRegex);
    if (scenarioMatch) {
      if (!currentRequirement) {
        section = "none";
        currentScenario = null;
        continue;
      }

      currentScenario = {
        title: scenarioMatch[1],
        bodyLines: [],
      };
      currentRequirement.scenarios.push(currentScenario);
      section = "scenario";
      continue;
    }

    if (/^##\s+/.test(line)) {
      section = "none";
      currentDeltaType = null;
      currentRequirement = null;
      currentScenario = null;
      continue;
    }

    if (section === "purpose") {
      purposeLines.push(line);
    } else if (section === "requirement" && currentRequirement) {
      currentRequirement.bodyLines.push(line);
    } else if (section === "scenario" && currentScenario) {
      currentScenario.bodyLines.push(line);
    }
  }

  const groups = requirementGroups.map(toRequirementGroup);

  return {
    id,
    purpose: trimMarkdown(purposeLines),
    sourcePath,
    deltaTypes: orderedDeltaTypes(groups),
    requirementsCount: groups.length,
    scenariosCount: groups.reduce((total, requirement) => total + requirement.scenarios.length, 0),
    requirementGroups: groups,
  };
}

function isDeltaItem(item: ProposalSpecDeltaItem | null): item is ProposalSpecDeltaItem {
  return item !== null;
}

async function readDeltaItem(changeDir: string, id: string): Promise<ProposalSpecDeltaItem | null> {
  try {
    const sourcePath = sourcePathFor(id);
    const content = await fs.readFile(join(changeDir, sourcePath), "utf8");
    const item = parseProposalSpecDeltaMarkdown(id, sourcePath, content);
    return item.requirementsCount > 0 ? item : null;
  } catch {
    return null;
  }
}

export async function getProposalSpecDeltas(
  projectPath: string,
  changeId: string
): Promise<ProposalSpecDeltaOverview> {
  const resolved = await resolveChangeDirAnywhere(projectPath, changeId);
  if (!resolved) {
    return { items: [] };
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(join(resolved.dir, "specs"), { withFileTypes: true });
  } catch {
    return { items: [] };
  }

  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const items = await Promise.all(ids.map((id) => readDeltaItem(resolved.dir, id)));

  return {
    items: items.filter(isDeltaItem),
  };
}
