import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Conventional commit header: type(scope): summary
//   type    : lowercase, may contain hyphens
//   scope   : lowercase, may contain digits, dots, slashes, or hyphens
//   summary : must start with a non-whitespace character
const conventionalHeaderPattern = /^[a-z][a-z0-9-]*\([a-z0-9][a-z0-9./-]*\): \S.*$/;
const allowedGeneratedHeaderPatterns = [
  /^Merge\b/,
  /^Revert\b/,
  /^Squashed commit of the following:$/,
];

function stripGitComments(message) {
  return message
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"));
}

function trimTrailingBlankLines(lines) {
  const trimmed = [...lines];

  while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === "") {
    trimmed.pop();
  }

  return trimmed;
}

function valid() {
  return { valid: true };
}

function invalid(error) {
  return { valid: false, error };
}

export function validateCommitMessage(message) {
  const lines = trimTrailingBlankLines(stripGitComments(message));
  const header = (lines[0] ?? "").trimEnd();

  if (header.length === 0) {
    return invalid("Commit message header is required.");
  }

  if (allowedGeneratedHeaderPatterns.some((pattern) => pattern.test(header))) {
    return valid();
  }

  if (!conventionalHeaderPattern.test(header)) {
    return invalid("Header must match: type(scope): summary");
  }

  const bodyLines = lines.slice(1);
  if (bodyLines.length === 0 || bodyLines.every((line) => line.trim() === "")) {
    return valid();
  }

  if (bodyLines[0].trim() !== "") {
    return invalid("Separate the header and body with a blank line.");
  }

  const bodyContentLines = bodyLines.slice(1);
  const invalidBodyLineIndex = bodyContentLines.findIndex(
    (line) => line.trim() !== "" && !line.startsWith("- ")
  );

  // Line numbers reported to the user are 1-based and include the header line and the
  // required blank line before the body, hence +3 (header + blank + 0-based index).
  if (invalidBodyLineIndex !== -1) {
    return invalid(`Body line ${invalidBodyLineIndex + 3} must start with "- ".`);
  }

  return valid();
}

export async function runCommitMessageValidation(messageFilePath) {
  if (!messageFilePath) {
    console.error("Missing commit message file path.");
    return 1;
  }

  const message = await readFile(messageFilePath, "utf8");
  const result = validateCommitMessage(message);

  if (result.valid) {
    return 0;
  }

  console.error(`Invalid commit message.

${result.error}

Expected:
  type(scope): summary

Optional body:
  - bullet one
  - bullet two

Allowed generated headers:
  Merge ...
  Revert ...
  Squashed commit of the following:`);

  return 1;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runCommitMessageValidation(process.argv[2])
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
