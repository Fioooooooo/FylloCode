import type { KnowledgeBrowserEntry, KnowledgeBrowserError } from "@shared/types/knowledge";

const statusPriority: Record<KnowledgeBrowserEntry["status"], number> = {
  suspect: 0,
  unknown: 1,
  active: 2,
};

export function sortKnowledgeEntries(entries: KnowledgeBrowserEntry[]): KnowledgeBrowserEntry[] {
  return [...entries].sort((left, right) => {
    const statusDifference = statusPriority[left.status] - statusPriority[right.status];
    if (statusDifference !== 0) {
      return statusDifference;
    }

    const updatedDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (!Number.isNaN(updatedDifference) && updatedDifference !== 0) {
      return updatedDifference;
    }

    return left.name.localeCompare(right.name);
  });
}

export function knowledgeSelectableNames(
  entries: KnowledgeBrowserEntry[],
  errors: KnowledgeBrowserError[]
): string[] {
  const names = sortKnowledgeEntries(entries).map((entry) => entry.name);
  const seen = new Set(names);

  for (const error of errors) {
    if (error.name && !seen.has(error.name)) {
      names.push(error.name);
      seen.add(error.name);
    }
  }

  return names;
}
