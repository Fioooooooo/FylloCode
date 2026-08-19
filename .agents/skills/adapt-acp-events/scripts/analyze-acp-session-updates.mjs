#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const LOGGER_MARKER = "[acp-mapper] ← sessionUpdate:";
const TOOL_EVENT_TYPES = new Set(["tool_call", "tool_call_update"]);
const TERMINAL_STATUSES = new Set(["completed", "failed"]);
const KNOWN_UPDATE_TYPES = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "available_commands_update",
  "config_option_update",
  "plan",
  "session_info_update",
  "tool_call",
  "tool_call_update",
  "usage_update",
]);
const METADATA_FIELDS = [
  "agentId",
  "agentName",
  "agentVersion",
  "agentVersionSource",
  "underlyingAgentVersion",
  "acpSdkVersion",
  "capturedAt",
];

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text, location) {
  try {
    return JSON.parse(text);
  } catch {
    fail(`Invalid JSON at ${location}.`);
  }
}

function unwrapUpdate(value, location) {
  if (!isRecord(value)) {
    fail(`Expected an object with sessionUpdate at ${location}.`);
  }

  if (typeof value.sessionUpdate === "string") {
    return value;
  }

  const params = isRecord(value.params) ? value.params : null;
  if (params && isRecord(params.update) && typeof params.update.sessionUpdate === "string") {
    return params.update;
  }

  if (isRecord(value.update) && typeof value.update.sessionUpdate === "string") {
    return value.update;
  }

  fail(`Missing sessionUpdate at ${location}.`);
}

function parseItems(items, location, options, warnings) {
  const updates = [];
  items.forEach((item, index) => {
    const itemLocation = `${location}[${index}]`;
    try {
      updates.push(unwrapUpdate(item, itemLocation));
    } catch (error) {
      if (!options.skipInvalid) {
        throw error;
      }
      warnings.push({ location: itemLocation, reason: error.message });
    }
  });
  return updates;
}

function extractDocument(value, location, options = {}) {
  const warnings = [];
  if (Array.isArray(value)) {
    return {
      updates: parseItems(value, location, options, warnings),
      parseWarnings: warnings,
    };
  }

  if (isRecord(value) && Array.isArray(value.updates)) {
    return {
      capture: isRecord(value.capture) ? value.capture : undefined,
      updates: parseItems(value.updates, `${location}.updates`, options, warnings),
      parseWarnings: warnings,
    };
  }

  return { updates: [unwrapUpdate(value, location)], parseWarnings: warnings };
}

export function parseTrace(text, sourceName = "input", options = {}) {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    fail(`No session/update records found in ${sourceName}.`);
  }

  try {
    return extractDocument(JSON.parse(trimmed), sourceName, options);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  const lines = text.split(/\r?\n/u);
  const loggerLines = lines
    .map((line, index) => ({ index: index + 1, line, marker: line.indexOf(LOGGER_MARKER) }))
    .filter((entry) => entry.marker >= 0);

  if (loggerLines.length > 0) {
    const updates = [];
    const parseWarnings = [];
    for (const { index, line, marker } of loggerLines) {
      const location = `${sourceName}:${index}`;
      try {
        const payload = line.slice(marker + LOGGER_MARKER.length).trim();
        const match = /^([a-z0-9_]+)\s+(\{.*\})$/u.exec(payload);
        if (match === null) {
          fail(`Invalid mapper session/update record at ${location}.`);
        }
        const update = unwrapUpdate(parseJson(match[2], location), location);
        if (update.sessionUpdate !== match[1]) {
          fail(`Mismatched sessionUpdate type at ${location}.`);
        }
        updates.push(update);
      } catch (error) {
        if (!options.skipInvalid) {
          throw error;
        }
        parseWarnings.push({ location, reason: error.message });
      }
    }
    if (updates.length === 0) {
      fail(`No valid session/update records found in ${sourceName}.`);
    }
    return { updates, parseWarnings };
  }

  const updates = [];
  const parseWarnings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) {
      continue;
    }
    const location = `${sourceName}:${index + 1}`;
    try {
      updates.push(unwrapUpdate(parseJson(line, location), location));
    } catch (error) {
      if (!options.skipInvalid) {
        throw error;
      }
      parseWarnings.push({ location, reason: error.message });
    }
  }

  if (updates.length === 0) {
    fail(`No session/update records found in ${sourceName}.`);
  }

  return { updates, parseWarnings };
}

function sorted(values) {
  return [...values].sort(compareText);
}

function compareText(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function presentFields(update) {
  return Object.keys(update)
    .filter((key) => key !== "sessionUpdate" && key !== "toolCallId")
    .sort(compareText);
}

function classifyReplacement(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "empty" : "non_empty";
  }
  return "other";
}

function collectKeyPaths(value, matcher, prefix = "", paths = new Set(), seen = new Set()) {
  if (!isRecord(value) && !Array.isArray(value)) {
    return paths;
  }
  if (seen.has(value)) {
    return paths;
  }
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (matcher(key)) {
      paths.add(path);
    }
    if (isRecord(child) || Array.isArray(child)) {
      collectKeyPaths(child, matcher, path, paths, seen);
    }
  }
  return paths;
}

function selectCaptureMetadata(capture, overrides) {
  const selected = {};
  for (const field of METADATA_FIELDS) {
    const override = overrides[field];
    const captured = capture?.[field];
    if (override !== undefined) {
      selected[field] = override;
    } else if (captured !== undefined) {
      selected[field] = captured;
    }
  }
  return selected;
}

function buildToolSummary(toolCallId, records) {
  const starts = records.filter(({ update }) => update.sessionUpdate === "tool_call");
  const updates = records.filter(({ update }) => update.sessionUpdate === "tool_call_update");
  const statuses = records
    .map(({ update }) => update.status)
    .filter((status) => typeof status === "string");
  const firstTerminalIndex = records.findIndex(
    ({ update }) => typeof update.status === "string" && TERMINAL_STATUSES.has(update.status)
  );
  const terminalStatuses = statuses.filter((status) => TERMINAL_STATUSES.has(status));
  const anomalies = [];

  if (records[0]?.update.sessionUpdate === "tool_call_update") {
    anomalies.push("orphan_update");
  }
  if (starts.length > 1) {
    anomalies.push("duplicate_start");
  }
  if (terminalStatuses.length === 0) {
    anomalies.push("missing_terminal_status");
  }
  if (terminalStatuses.length > 1) {
    anomalies.push("multiple_terminal_updates");
  }
  if (firstTerminalIndex >= 0 && firstTerminalIndex < records.length - 1) {
    anomalies.push("update_after_terminal");
  }

  const replacementSignals = { content: [], locations: [] };
  for (const { update } of updates) {
    for (const field of ["content", "locations"]) {
      if (Object.hasOwn(update, field)) {
        replacementSignals[field].push(classifyReplacement(update[field]));
      }
    }
  }

  const parentMetadataPaths = new Set();
  const subagentMetadataPaths = new Set();
  for (const { update } of records) {
    collectKeyPaths(
      update,
      (key) => /parent.*tool.*(?:id|use)/iu.test(key),
      "",
      parentMetadataPaths
    );
    collectKeyPaths(update, (key) => /sub.?agent/iu.test(key), "", subagentMetadataPaths);
  }

  return {
    toolCallId,
    firstEvent: records[0].update.sessionUpdate,
    eventIndexes: records.map(({ index }) => index),
    startCount: starts.length,
    updateCount: updates.length,
    statuses,
    startFields: sorted(new Set(starts.flatMap(({ update }) => presentFields(update)))),
    updateFields: sorted(new Set(updates.flatMap(({ update }) => presentFields(update)))),
    replacementSignals,
    parentMetadataPaths: sorted(parentMetadataPaths),
    subagentMetadataPaths: sorted(subagentMetadataPaths),
    anomalies: sorted(anomalies),
  };
}

export function analyzeTrace(document, metadataOverrides = {}) {
  const eventTypeCounts = new Map();
  const tools = new Map();

  document.updates.forEach((update, index) => {
    const eventIndex = index + 1;
    eventTypeCounts.set(update.sessionUpdate, (eventTypeCounts.get(update.sessionUpdate) ?? 0) + 1);

    if (!TOOL_EVENT_TYPES.has(update.sessionUpdate)) {
      return;
    }
    if (typeof update.toolCallId !== "string" || update.toolCallId.length === 0) {
      fail(`Missing toolCallId at event ${eventIndex}.`);
    }
    const records = tools.get(update.toolCallId) ?? [];
    records.push({ index: eventIndex, update });
    tools.set(update.toolCallId, records);
  });

  const eventTypes = [...eventTypeCounts.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([type, count]) => ({ type, count }));
  const unknownEventTypes = eventTypes.filter(({ type }) => !KNOWN_UPDATE_TYPES.has(type));
  const toolCalls = [...tools.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([toolCallId, records]) => buildToolSummary(toolCallId, records));

  return {
    metadata: selectCaptureMetadata(document.capture, metadataOverrides),
    summary: {
      eventCount: document.updates.length,
      eventTypeCount: eventTypes.length,
      toolCallCount: toolCalls.length,
      unknownEventTypeCount: unknownEventTypes.length,
      invalidRecordCount: document.parseWarnings?.length ?? 0,
    },
    eventTypes,
    unknownEventTypes,
    toolCalls,
    parseWarnings: document.parseWarnings ?? [],
  };
}

function inlineList(values) {
  return values.length === 0 ? "none" : values.map(formatInlineCode).join(", ");
}

function formatInlineCode(value) {
  const sanitized = String(value)
    .replace(/[\r\n]+/gu, " ")
    .replaceAll("|", "\\|")
    .replaceAll("`", "\\`");
  return `\`${sanitized}\``;
}

export function formatMarkdown(report, sourceName = "input") {
  const lines = [
    "# ACP session/update analysis",
    "",
    `- Source: ${formatInlineCode(basename(sourceName))}`,
    `- Events: ${report.summary.eventCount}`,
    `- Tool calls: ${report.summary.toolCallCount}`,
    `- Unknown update types: ${report.summary.unknownEventTypeCount}`,
    `- Skipped invalid records: ${report.summary.invalidRecordCount}`,
  ];

  const metadataEntries = Object.entries(report.metadata);
  if (metadataEntries.length > 0) {
    lines.push("", "## Capture metadata", "");
    for (const [key, value] of metadataEntries) {
      lines.push(`- ${key}: ${value === null ? "null" : formatInlineCode(value)}`);
    }
  }

  lines.push("", "## Event types", "", "| Type | Count | Known |", "| --- | ---: | :---: |");
  for (const { type, count } of report.eventTypes) {
    lines.push(
      `| ${formatInlineCode(type)} | ${count} | ${KNOWN_UPDATE_TYPES.has(type) ? "yes" : "no"} |`
    );
  }

  lines.push("", "## Tool calls");
  if (report.toolCalls.length === 0) {
    lines.push("", "No tool-call events found.");
  }

  for (const tool of report.toolCalls) {
    lines.push(
      "",
      `### ${formatInlineCode(tool.toolCallId)}`,
      "",
      `- First event: ${formatInlineCode(tool.firstEvent)}`,
      `- Event indexes: ${tool.eventIndexes.join(", ")}`,
      `- Starts / updates: ${tool.startCount} / ${tool.updateCount}`,
      `- Statuses: ${inlineList(tool.statuses)}`,
      `- Start fields: ${inlineList(tool.startFields)}`,
      `- Update fields: ${inlineList(tool.updateFields)}`,
      `- Content replacements: ${inlineList(tool.replacementSignals.content)}`,
      `- Location replacements: ${inlineList(tool.replacementSignals.locations)}`,
      `- Parent metadata paths: ${inlineList(tool.parentMetadataPaths)}`,
      `- Subagent metadata paths: ${inlineList(tool.subagentMetadataPaths)}`,
      `- Anomalies: ${inlineList(tool.anomalies)}`
    );
  }

  if (report.parseWarnings.length > 0) {
    lines.push("", "## Skipped invalid records", "");
    for (const warning of report.parseWarnings) {
      lines.push(`- ${formatInlineCode(warning.location)}: ${warning.reason}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function parseArguments(argv) {
  const result = { format: "markdown", metadata: {}, skipInvalid: false };
  const valueOptions = new Map([
    ["--agent-id", "agentId"],
    ["--agent-name", "agentName"],
    ["--agent-version", "agentVersion"],
    ["--agent-version-source", "agentVersionSource"],
    ["--underlying-agent-version", "underlyingAgentVersion"],
    ["--acp-sdk-version", "acpSdkVersion"],
    ["--captured-at", "capturedAt"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--skip-invalid") {
      result.skipInvalid = true;
      continue;
    }
    if (argument === "--format") {
      const value = argv[index + 1];
      if (value !== "markdown" && value !== "json") {
        fail("--format must be markdown or json.");
      }
      result.format = value;
      index += 1;
      continue;
    }

    const metadataField = valueOptions.get(argument);
    if (metadataField) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`${argument} requires a value.`);
      }
      result.metadata[metadataField] = value;
      index += 1;
      continue;
    }

    if (argument.startsWith("--")) {
      fail(`Unknown option ${argument}.`);
    }
    if (result.inputPath !== undefined) {
      fail("Provide exactly one trace path.");
    }
    result.inputPath = argument;
  }

  if (result.inputPath === undefined) {
    fail(
      "Usage: analyze-acp-session-updates.mjs <trace-path> [--format markdown|json] [--skip-invalid]."
    );
  }
  return result;
}

export async function run(argv) {
  const options = parseArguments(argv);
  const sourceName = basename(options.inputPath);
  let text;
  try {
    text = await readFile(options.inputPath, "utf8");
  } catch {
    fail(`Unable to read ${sourceName}.`);
  }
  const document = parseTrace(text, sourceName, { skipInvalid: options.skipInvalid });
  const report = analyzeTrace(document, options.metadata);
  return options.format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatMarkdown(report, sourceName);
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  run(process.argv.slice(2)).then(
    (output) => process.stdout.write(output),
    (error) => {
      const message = error instanceof Error ? error.message : "Unknown analysis error.";
      process.stderr.write(`Error: ${message}\n`);
      process.exitCode = 1;
    }
  );
}
