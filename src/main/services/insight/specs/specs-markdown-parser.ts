import type { SpecBrowserItem, SpecRequirementGroup, SpecScenarioGroup } from "@shared/types/specs";

type MutableRequirementGroup = Omit<SpecRequirementGroup, "body" | "scenarios"> & {
  bodyLines: string[];
  scenarios: MutableScenarioGroup[];
};

type MutableScenarioGroup = Omit<SpecScenarioGroup, "body"> & {
  bodyLines: string[];
};

type ParserSection = "none" | "purpose" | "requirement" | "scenario";

// Headings are case-insensitive. Requirement/Scenario headings support both English and Chinese
// labels and capture the title after the colon.
const purposeHeadingRegex = /^##\s+Purpose\s*:?$/i;
const requirementHeadingRegex = /^###\s+(?:Requirement|要求)\s*[:：]\s*(.+?)\s*$/i;
const scenarioHeadingRegex = /^####\s+(?:Scenario|场景)\s*[:：]\s*(.+?)\s*$/i;

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

function toRequirementGroup(group: MutableRequirementGroup): SpecRequirementGroup {
  return {
    title: group.title,
    body: trimMarkdown(group.bodyLines),
    scenarios: group.scenarios.map((scenario) => ({
      title: scenario.title,
      body: trimMarkdown(scenario.bodyLines),
    })),
  };
}

export function parseSpecMarkdown(
  id: string,
  sourcePath: string,
  content: string,
  updatedAt: string
): SpecBrowserItem {
  const purposeLines: string[] = [];
  const requirementGroups: MutableRequirementGroup[] = [];
  let section: ParserSection = "none";
  let currentRequirement: MutableRequirementGroup | null = null;
  let currentScenario: MutableScenarioGroup | null = null;

  // Normalize line endings so the parser only has to handle `\n`.
  for (const line of content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    // Top-level `# ` title is ignored; the document title comes from the spec file name.
    if (/^#\s+/.test(line)) {
      continue;
    }

    if (purposeHeadingRegex.test(line)) {
      section = "purpose";
      currentRequirement = null;
      currentScenario = null;
      continue;
    }

    const requirementMatch = line.match(requirementHeadingRegex);
    if (requirementMatch) {
      currentRequirement = {
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
      // A scenario must belong to a requirement; orphan scenarios are dropped.
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

    // Any other `## ` heading ends the current purpose/requirement/scenario block.
    if (/^##\s+/.test(line)) {
      section = "none";
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
    updatedAt,
    requirementsCount: groups.length,
    scenariosCount: groups.reduce((total, requirement) => total + requirement.scenarios.length, 0),
    requirementGroups: groups,
  };
}
