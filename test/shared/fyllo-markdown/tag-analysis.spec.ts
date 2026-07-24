import { describe, expect, it } from "vitest";
import { analyzeFylloTagMarkdown } from "@shared/fyllo-markdown/tag-analysis";

const tagNames = ["fyllo-action", "fyllo-signal"] as const;

function tag(tagName: string, label: string): string {
  return `<${tagName} type="show.time">{"label":"${label}"}</${tagName}>`;
}

describe("analyzeFylloTagMarkdown", () => {
  it.each([
    { name: "document start", build: (value: string) => value, disposition: "candidate" },
    { name: "three spaces", build: (value: string) => `   ${value}`, disposition: "candidate" },
    { name: "four spaces", build: (value: string) => `    ${value}`, disposition: "literal" },
    { name: "prose prefix", build: (value: string) => `example ${value}`, disposition: "literal" },
    { name: "prose suffix", build: (value: string) => `${value} example`, disposition: "literal" },
    { name: "list", build: (value: string) => `- ${value}`, disposition: "literal" },
    { name: "blockquote", build: (value: string) => `> ${value}`, disposition: "literal" },
  ])("applies the same standalone rule to both tags: $name", ({ build, disposition }) => {
    const results = tagNames.map((tagName) => {
      const source = build(tag(tagName, "same"));
      const [occurrence] = analyzeFylloTagMarkdown(source, { tagName }).occurrences;
      expect(source.slice(occurrence.start, occurrence.end)).toBe(occurrence.raw);
      return { disposition: occurrence.disposition, context: occurrence.context };
    });

    expect(results).toEqual([
      { disposition, context: "markdown" },
      { disposition, context: "markdown" },
    ]);
  });

  it.each([
    {
      name: "inline code",
      build: (value: string) => `\`${value}\``,
      context: "inline_code",
    },
    {
      name: "backtick fence",
      build: (value: string) => `\`\`\`text\n${value}\n\`\`\``,
      context: "fenced_code",
    },
    {
      name: "tilde fence",
      build: (value: string) => `~~~text\n${value}\n~~~`,
      context: "fenced_code",
    },
  ])("applies the same code-context rule to both tags: $name", ({ build, context }) => {
    const results = tagNames.map((tagName) => {
      const source = build(tag(tagName, "code"));
      const [occurrence] = analyzeFylloTagMarkdown(source, { tagName }).occurrences;
      expect(source.slice(occurrence.start, occurrence.end)).toBe(occurrence.raw);
      return { disposition: occurrence.disposition, context: occurrence.context };
    });

    expect(results).toEqual([
      { disposition: "literal", context },
      { disposition: "literal", context },
    ]);
  });

  it("preserves CRLF ranges and source ordinals for multiple occurrences", () => {
    for (const tagName of tagNames) {
      const source = [
        `Example: \`${tag(tagName, "literal")}\``,
        "",
        tag(tagName, "first"),
        "",
        tag(tagName, "second"),
      ].join("\r\n");
      const analysis = analyzeFylloTagMarkdown(source, { tagName });

      expect(analysis.occurrences.map(({ disposition }) => disposition)).toEqual([
        "literal",
        "candidate",
        "candidate",
      ]);
      expect(analysis.occurrences.map(({ sourceOrdinal }) => sourceOrdinal)).toEqual([0, 1, 2]);
      for (const occurrence of analysis.occurrences) {
        expect(source.slice(occurrence.start, occurrence.end)).toBe(occurrence.raw);
      }
    }
  });

  it("keeps unclosed occurrences literal for both tags", () => {
    const results = tagNames.map((tagName) => {
      const source = `<${tagName} type="show.time">{"label":"streaming"}`;
      const [occurrence] = analyzeFylloTagMarkdown(source, { tagName }).occurrences;
      expect(occurrence.end).toBe(source.length);
      expect(occurrence.raw).toBe(source);
      return {
        closed: occurrence.closed,
        disposition: occurrence.disposition,
        context: occurrence.context,
      };
    });

    expect(results).toEqual([
      { closed: false, disposition: "literal", context: "markdown" },
      { closed: false, disposition: "literal", context: "markdown" },
    ]);
  });
});
