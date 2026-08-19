#!/usr/bin/env node

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import spawn from "cross-spawn";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

const DEFAULT_TIMEOUTS = Object.freeze({
  spawnMs: 10_000,
  initializeMs: 30_000,
  newSessionMs: 30_000,
  promptMs: 90_000,
  shutdownGraceMs: 500,
  forceKillGraceMs: 500,
});
const MAX_STDERR_BYTES = 64 * 1024;
const PLAN_FIELDS = new Set([
  "schemaVersion",
  "capture",
  "command",
  "args",
  "cwd",
  "env",
  "clientInfo",
  "mcpServers",
  "timeouts",
  "prompts",
]);
const CAPTURE_FIELDS = new Set([
  "agentId",
  "agentName",
  "agentVersion",
  "agentVersionSource",
  "underlyingAgentVersion",
  "acpSdkVersion",
]);
const TIMEOUT_FIELDS = new Set(Object.keys(DEFAULT_TIMEOUTS));
const PROMPT_FIELDS = new Set(["scenario", "prompt", "continueOnError", "timeoutMs"]);
const CLIENT_INFO_FIELDS = new Set(["name", "version"]);

class PhaseTimeoutError extends Error {
  constructor(phase, timeoutMs) {
    super(`${phase} timed out after ${timeoutMs}ms.`);
    this.name = "PhaseTimeoutError";
    this.code = "PHASE_TIMEOUT";
  }
}

class CaptureInterruptedError extends Error {
  constructor(signal) {
    super(`Capture interrupted by ${signal}.`);
    this.name = "CaptureInterruptedError";
    this.code = "CAPTURE_INTERRUPTED";
    this.signal = signal;
  }
}

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownFields(value, fields, location) {
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) {
      fail(`Unknown field ${location}.${field}.`);
    }
  }
}

function requireString(value, location) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${location} must be a non-empty string.`);
  }
  return value;
}

function requireNullableString(value, location) {
  if (value !== null && (typeof value !== "string" || value.trim().length === 0)) {
    fail(`${location} must be a non-empty string or null.`);
  }
  return value;
}

function validateTimeout(value, location) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 30 * 60 * 1000) {
    fail(`${location} must be an integer between 1 and 1800000.`);
  }
  return value;
}

function validateCaptureMetadata(value) {
  if (!isRecord(value)) {
    fail("capture must be an object.");
  }
  assertKnownFields(value, CAPTURE_FIELDS, "capture");
  return {
    agentId: requireString(value.agentId, "capture.agentId"),
    agentName: requireString(value.agentName, "capture.agentName"),
    agentVersion: requireNullableString(value.agentVersion, "capture.agentVersion"),
    agentVersionSource: requireString(value.agentVersionSource, "capture.agentVersionSource"),
    underlyingAgentVersion: requireNullableString(
      value.underlyingAgentVersion,
      "capture.underlyingAgentVersion"
    ),
    acpSdkVersion: requireString(value.acpSdkVersion, "capture.acpSdkVersion"),
  };
}

function validateEnvironment(value) {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    fail("env must be an object of string values.");
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.length === 0 || typeof item !== "string") {
      fail("env must be an object of string values.");
    }
    result[key] = item;
  }
  return result;
}

function validateClientInfo(value) {
  if (value === undefined) {
    return { name: "FylloCode", version: "adapt-acp-events" };
  }
  if (!isRecord(value)) {
    fail("clientInfo must be an object.");
  }
  assertKnownFields(value, CLIENT_INFO_FIELDS, "clientInfo");
  return {
    name: requireString(value.name, "clientInfo.name"),
    version: requireString(value.version, "clientInfo.version"),
  };
}

function validateTimeouts(value) {
  if (value === undefined) return { ...DEFAULT_TIMEOUTS };
  if (!isRecord(value)) {
    fail("timeouts must be an object.");
  }
  assertKnownFields(value, TIMEOUT_FIELDS, "timeouts");
  const result = { ...DEFAULT_TIMEOUTS };
  for (const [field, timeout] of Object.entries(value)) {
    result[field] = validateTimeout(timeout, `timeouts.${field}`);
  }
  return result;
}

function validatePrompts(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail("prompts must be a non-empty array.");
  }
  return value.map((entry, index) => {
    const location = `prompts[${index}]`;
    if (!isRecord(entry)) {
      fail(`${location} must be an object.`);
    }
    assertKnownFields(entry, PROMPT_FIELDS, location);
    if (!Array.isArray(entry.prompt) || entry.prompt.length === 0) {
      fail(`${location}.prompt must be a non-empty ACP content block array.`);
    }
    if (entry.prompt.some((block) => !isRecord(block))) {
      fail(`${location}.prompt must contain only ACP content block objects.`);
    }
    if (entry.continueOnError !== undefined && typeof entry.continueOnError !== "boolean") {
      fail(`${location}.continueOnError must be a boolean.`);
    }
    return {
      scenario: requireString(entry.scenario, `${location}.scenario`),
      prompt: entry.prompt,
      continueOnError: entry.continueOnError ?? false,
      timeoutMs:
        entry.timeoutMs === undefined
          ? undefined
          : validateTimeout(entry.timeoutMs, `${location}.timeoutMs`),
    };
  });
}

export function validateCapturePlan(value) {
  if (!isRecord(value)) {
    fail("Capture plan must be a JSON object.");
  }
  assertKnownFields(value, PLAN_FIELDS, "plan");
  if (value.schemaVersion !== 1) {
    fail("schemaVersion must be 1.");
  }
  if (!Array.isArray(value.args) || value.args.some((argument) => typeof argument !== "string")) {
    fail("args must be an array of strings.");
  }
  const cwd = requireString(value.cwd, "cwd");
  if (!isAbsolute(cwd)) {
    fail("cwd must be an absolute path.");
  }
  if (!Array.isArray(value.mcpServers)) {
    fail("mcpServers must be an array.");
  }
  return {
    schemaVersion: 1,
    capture: validateCaptureMetadata(value.capture),
    command: requireString(value.command, "command"),
    args: [...value.args],
    cwd,
    env: validateEnvironment(value.env),
    clientInfo: validateClientInfo(value.clientInfo),
    mcpServers: value.mcpServers,
    timeouts: validateTimeouts(value.timeouts),
    prompts: validatePrompts(value.prompts),
  };
}

export async function loadCapturePlan(planPath) {
  let text;
  try {
    text = await readFile(planPath, "utf8");
  } catch {
    fail(`Unable to read capture plan ${basename(planPath)}.`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(`Invalid JSON in capture plan ${basename(planPath)}.`);
  }
  return validateCapturePlan(value);
}

let atomicWriteSequence = 0;

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  atomicWriteSequence += 1;
  const temporaryPath = `${path}.${process.pid}.${atomicWriteSequence}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

class SnapshotWriter {
  constructor(path) {
    this.path = path;
    this.tail = Promise.resolve();
    this.failure = null;
  }

  write(value) {
    const snapshot = structuredClone(value);
    const operation = this.tail.then(() => atomicWriteJson(this.path, snapshot));
    this.tail = operation.catch((error) => {
      this.failure ??= error;
    });
    return operation;
  }

  async flush() {
    await this.tail;
    if (this.failure) throw this.failure;
  }
}

function collectSensitiveValues(plan) {
  const values = new Set([plan.command, plan.cwd, ...Object.values(plan.env)]);
  for (const prompt of plan.prompts) {
    for (const block of prompt.prompt) {
      if (typeof block.text === "string") values.add(block.text);
    }
  }
  return [...values].filter((value) => typeof value === "string" && value.length >= 4);
}

function redactSensitiveText(value, sensitiveValues) {
  let result = String(value);
  for (const sensitive of sensitiveValues) {
    result = result.replaceAll(sensitive, "<redacted>");
  }
  return result
    .replace(/\/(?:Users|home)\/[^/\s]+/gu, "/<home>")
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/gu, "<home>");
}

function sanitizeText(value, sensitiveValues) {
  return redactSensitiveText(value, sensitiveValues)
    .replace(/[\r\n]+/gu, " ")
    .slice(0, 500);
}

function serializeError(error, sensitiveValues) {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : undefined;
  return {
    name: error instanceof Error ? error.name : "Error",
    ...(code ? { code } : {}),
    message: sanitizeText(error instanceof Error ? error.message : String(error), sensitiveValues),
  };
}

function classifyDiagnostic(error, phase, stderrTail, sensitiveValues) {
  const serialized = serializeError(error, sensitiveValues);
  const evidence = `${serialized.message}\n${stderrTail}`;
  if (/EMFILE[^\n]*watch|too many open files[^\n]*watch/iu.test(evidence)) {
    return {
      code: "FILE_WATCH_UNAVAILABLE",
      phase,
      message: "The Agent could not create a filesystem watcher in the current environment.",
      recommendation: "Retry only through the host's approved non-sandbox execution flow.",
    };
  }
  if (/\bEPERM\b|operation not permitted/iu.test(evidence)) {
    return {
      code: "SANDBOX_PERMISSION_DENIED",
      phase,
      message: "The Agent encountered an environment permission denial.",
      recommendation:
        "Review the raw temporary trace and use the host approval flow if a retry is needed.",
    };
  }
  if (error instanceof PhaseTimeoutError) {
    return {
      code: "PHASE_TIMEOUT",
      phase,
      message: serialized.message,
      recommendation: "Inspect the last completed phase and bounded stderr before retrying.",
    };
  }
  if (error instanceof CaptureInterruptedError) {
    return {
      code: "CAPTURE_INTERRUPTED",
      phase,
      message: serialized.message,
      recommendation: "Use the incrementally saved updates before deciding whether to retry.",
    };
  }
  return {
    code: "ACP_PHASE_FAILED",
    phase,
    message: serialized.message,
    recommendation: "Inspect the saved phase, process exit, and bounded stderr evidence.",
  };
}

function appendBoundedStderr(processState, chunk, sensitiveValues) {
  const redactedChunk = redactSensitiveText(chunk, sensitiveValues);
  const combined = Buffer.from(`${processState.stderrTail}${redactedChunk}`, "utf8");
  if (combined.byteLength <= MAX_STDERR_BYTES) {
    processState.stderrTail = combined.toString("utf8");
    return;
  }
  processState.stderrTail = combined
    .subarray(combined.byteLength - MAX_STDERR_BYTES)
    .toString("utf8");
  processState.stderrTruncated = true;
}

function withDeadline(promise, phase, timeoutMs, signal) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () =>
      settle(
        rejectPromise,
        signal.reason instanceof Error
          ? signal.reason
          : new CaptureInterruptedError("unknown signal")
      );
    const timeout = setTimeout(
      () => settle(rejectPromise, new PhaseTimeoutError(phase, timeoutMs)),
      timeoutMs
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => settle(resolvePromise, value),
      (error) => settle(rejectPromise, error)
    );
  });
}

async function executePhase(context, name, timeoutMs, task) {
  const phase = {
    name,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  context.state.currentPhase = name;
  context.state.phases.push(phase);
  await context.writer.write(context.state);
  const startedAt = Date.now();
  try {
    const result = await withDeadline(
      Promise.resolve().then(task),
      name,
      timeoutMs,
      context.abortController.signal
    );
    phase.status = "completed";
    phase.completedAt = new Date().toISOString();
    phase.durationMs = Date.now() - startedAt;
    await context.writer.write(context.state);
    return result;
  } catch (error) {
    phase.status = "failed";
    phase.completedAt = new Date().toISOString();
    phase.durationMs = Date.now() - startedAt;
    phase.error = serializeError(error, context.sensitiveValues);
    context.state.diagnostics.push(
      classifyDiagnostic(error, name, context.state.process.stderrTail, context.sensitiveValues)
    );
    await context.writer.write(context.state);
    throw error;
  }
}

function waitForChildEvent(child, event, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.removeListener(event, onEvent);
      resolvePromise(value);
    };
    const onEvent = () => settle(true);
    const timeout = setTimeout(() => settle(false), timeoutMs);
    child.once(event, onEvent);
  });
}

function settlesWithin(promise, timeoutMs) {
  return new Promise((resolvePromise) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise(value);
    };
    const timeout = setTimeout(() => settle(false), timeoutMs);
    Promise.resolve(promise).then(
      () => settle(true),
      () => settle(true)
    );
  });
}

function processExists(pid, killProcess) {
  try {
    killProcess(-pid, 0);
    return true;
  } catch (error) {
    return !(isRecord(error) && error.code === "ESRCH");
  }
}

async function runTaskkill(pid, spawnProcess, timeoutMs) {
  return new Promise((resolvePromise) => {
    let killer;
    try {
      killer = spawnProcess("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        detached: true,
      });
      killer.unref?.();
    } catch {
      resolvePromise(false);
      return;
    }
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise(value);
    };
    const timeout = setTimeout(() => settle(false), timeoutMs);
    killer.once("close", () => settle(true));
    killer.once("error", () => settle(false));
  });
}

export async function terminateChildProcess(child, timeouts, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  const killProcess = dependencies.killProcess ?? process.kill.bind(process);
  const spawnProcess = dependencies.spawnProcess ?? spawn;
  const result = {
    method: "already-exited",
    forced: false,
    completed: true,
  };
  if (child.exitCode !== null || child.signalCode !== null) return result;

  try {
    child.stdin.end();
  } catch {
    // Continue with process-tree cleanup.
  }
  if (await waitForChildEvent(child, "close", timeouts.shutdownGraceMs)) {
    return { ...result, method: "stdin-close" };
  }
  const pid = child.pid;
  if (pid === undefined) {
    try {
      child.kill("SIGKILL");
      return { method: "child-sigkill", forced: true, completed: true };
    } catch {
      return { method: "child-sigkill", forced: true, completed: false };
    }
  }

  if (platform === "win32") {
    const completed = await runTaskkill(pid, spawnProcess, timeouts.forceKillGraceMs);
    return { method: "taskkill", forced: true, completed };
  }

  try {
    killProcess(-pid, "SIGTERM");
  } catch (error) {
    if (isRecord(error) && error.code === "ESRCH") {
      return { method: "sigterm", forced: false, completed: true };
    }
  }
  if (await waitForChildEvent(child, "close", timeouts.forceKillGraceMs)) {
    return { method: "sigterm", forced: false, completed: true };
  }
  if (!processExists(pid, killProcess)) {
    return { method: "sigterm", forced: false, completed: true };
  }
  try {
    killProcess(-pid, "SIGKILL");
    const closed = await waitForChildEvent(child, "close", timeouts.forceKillGraceMs);
    const completed = closed || !processExists(pid, killProcess);
    return { method: "sigkill", forced: true, completed };
  } catch (error) {
    const completed = isRecord(error) && error.code === "ESRCH";
    return { method: "sigkill", forced: true, completed };
  }
}

function createInitialState(plan) {
  return {
    schemaVersion: 1,
    capture: {
      ...plan.capture,
      capturedAt: new Date().toISOString(),
    },
    scenario: plan.prompts.map((prompt) => prompt.scenario).join("; "),
    status: "running",
    currentPhase: "prepare",
    startedAt: new Date().toISOString(),
    completedAt: null,
    initializeResponse: null,
    session: null,
    phases: [],
    prompts: plan.prompts.map((prompt) => ({
      scenario: prompt.scenario,
      status: "pending",
    })),
    permissionRequests: [],
    updates: [],
    diagnostics: [],
    process: {
      pid: null,
      exitCode: null,
      signal: null,
      stderrTail: "",
      stderrTruncated: false,
      cleanup: null,
    },
    error: null,
  };
}

function waitForSpawn(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    const onSpawn = () => {
      child.removeListener("error", onError);
      resolvePromise(child);
    };
    const onError = (error) => {
      child.removeListener("spawn", onSpawn);
      rejectPromise(error);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

export async function captureAcpEvents(plan, outputPath, dependencies = {}) {
  const spawnProcess = dependencies.spawnProcess ?? spawn;
  const writer = new SnapshotWriter(outputPath);
  const state = createInitialState(plan);
  const sensitiveValues = collectSensitiveValues(plan);
  const abortController = new AbortController();
  const context = { state, writer, sensitiveValues, abortController };
  let child = null;
  let connection = null;
  let finalStatus = "completed";
  let fatalError = null;

  const interruptHandlers = new Map(
    ["SIGINT", "SIGTERM"].map((signal) => [
      signal,
      () => abortController.abort(new CaptureInterruptedError(signal)),
    ])
  );
  for (const [signal, handler] of interruptHandlers) process.once(signal, handler);

  await writer.write(state);
  try {
    child = await executePhase(context, "spawn", plan.timeouts.spawnMs, async () => {
      const spawned = spawnProcess(plan.command, plan.args, {
        cwd: plan.cwd,
        env: { ...process.env, ...plan.env },
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      state.process.pid = spawned.pid ?? null;
      spawned.stderr.setEncoding("utf8");
      spawned.stderr.on("data", (chunk) => {
        appendBoundedStderr(state.process, chunk, sensitiveValues);
        void writer.write(state).catch(() => {});
      });
      spawned.on("exit", (code, signal) => {
        state.process.exitCode = code;
        state.process.signal = signal;
        void writer.write(state).catch(() => {});
      });
      return waitForSpawn(spawned);
    });

    const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
    connection = new ClientSideConnection(
      () => ({
        async requestPermission(params) {
          const record = {
            receivedAt: new Date().toISOString(),
            request: params,
            outcome: null,
          };
          state.permissionRequests.push(record);
          const allow = params.options.find((option) => option.kind === "allow_once");
          record.outcome = allow
            ? { outcome: "selected", optionId: allow.optionId }
            : { outcome: "cancelled" };
          await writer.write(state);
          return { outcome: record.outcome };
        },
        async sessionUpdate(notification) {
          state.updates.push({
            receivedAt: new Date().toISOString(),
            sessionId: notification.sessionId,
            update: notification.update,
          });
          await writer.write(state);
        },
      }),
      stream
    );

    state.initializeResponse = await executePhase(
      context,
      "initialize",
      plan.timeouts.initializeMs,
      () =>
        connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: { session: { configOptions: { boolean: {} } } },
          clientInfo: plan.clientInfo,
        })
    );
    state.session = await executePhase(context, "newSession", plan.timeouts.newSessionMs, () =>
      connection.newSession({ cwd: plan.cwd, mcpServers: plan.mcpServers })
    );

    let promptFailures = 0;
    for (let index = 0; index < plan.prompts.length; index += 1) {
      const promptPlan = plan.prompts[index];
      const promptState = state.prompts[index];
      promptState.status = "running";
      promptState.startedAt = new Date().toISOString();
      await writer.write(state);
      let promptRequest = null;
      try {
        const response = await executePhase(
          context,
          `prompt:${index + 1}`,
          promptPlan.timeoutMs ?? plan.timeouts.promptMs,
          () => {
            promptRequest = connection.prompt({
              sessionId: state.session.sessionId,
              prompt: promptPlan.prompt,
            });
            return promptRequest;
          }
        );
        promptState.status = "completed";
        promptState.completedAt = new Date().toISOString();
        promptState.response = response;
        await writer.write(state);
      } catch (error) {
        promptFailures += 1;
        promptState.status = "failed";
        promptState.completedAt = new Date().toISOString();
        promptState.error = serializeError(error, sensitiveValues);
        await writer.write(state);
        if (error instanceof PhaseTimeoutError) {
          await connection.cancel({ sessionId: state.session.sessionId }).catch(() => {});
          promptState.cancelSettled =
            promptRequest !== null &&
            (await settlesWithin(promptRequest, plan.timeouts.shutdownGraceMs));
          await writer.write(state);
          if (!promptState.cancelSettled) throw error;
        }
        if (!promptPlan.continueOnError || error instanceof CaptureInterruptedError) {
          throw error;
        }
      }
    }
    finalStatus = promptFailures > 0 ? "completed_with_errors" : "completed";
  } catch (error) {
    fatalError = error;
    finalStatus = error instanceof CaptureInterruptedError ? "interrupted" : "failed";
    state.error = serializeError(error, sensitiveValues);
  } finally {
    for (const [signal, handler] of interruptHandlers) {
      process.removeListener(signal, handler);
    }
    if (child) {
      const phase = {
        name: "shutdown",
        status: "running",
        startedAt: new Date().toISOString(),
      };
      const startedAt = Date.now();
      state.currentPhase = "shutdown";
      state.phases.push(phase);
      await writer.write(state);
      try {
        state.process.cleanup = await terminateChildProcess(child, plan.timeouts, {
          spawnProcess,
          ...dependencies,
        });
        phase.status = state.process.cleanup.completed ? "completed" : "failed";
        if (!state.process.cleanup.completed) finalStatus = "failed";
      } catch (error) {
        phase.status = "failed";
        phase.error = serializeError(error, sensitiveValues);
        state.process.cleanup = { method: "unknown", forced: true, completed: false };
        state.diagnostics.push(
          classifyDiagnostic(error, "shutdown", state.process.stderrTail, sensitiveValues)
        );
        state.error ??= serializeError(error, sensitiveValues);
        fatalError ??= error;
        finalStatus = "failed";
      }
      phase.completedAt = new Date().toISOString();
      phase.durationMs = Date.now() - startedAt;
    }
    state.status = finalStatus;
    state.currentPhase = null;
    state.completedAt = new Date().toISOString();
    await writer.write(state);
    await writer.flush();
  }

  return { capturePath: outputPath, state, error: fatalError };
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      const output = argv[index + 1];
      if (output === undefined || output.startsWith("--")) {
        fail("--output requires a path.");
      }
      result.outputPath = resolve(output);
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) {
      fail(`Unknown option ${argument}.`);
    }
    if (result.planPath) {
      fail("Provide exactly one capture plan path.");
    }
    result.planPath = resolve(argument);
  }
  if (!result.planPath) {
    fail("Usage: capture-acp-events.mjs <plan-path> [--output <capture-path>].");
  }
  result.outputPath ??= resolve(dirname(result.planPath), "acp-events.capture.json");
  if (result.outputPath === result.planPath) {
    fail("Capture output path must differ from the plan path.");
  }
  return result;
}

export async function run(argv) {
  const options = parseArguments(argv);
  const plan = await loadCapturePlan(options.planPath);
  return captureAcpEvents(plan, options.outputPath);
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  run(process.argv.slice(2)).then(
    (result) => {
      process.stdout.write(
        `${JSON.stringify({ capturePath: result.capturePath, status: result.state.status })}\n`
      );
      if (result.state.status !== "completed") process.exitCode = 1;
    },
    (error) => {
      const message = error instanceof Error ? error.message : "Unknown capture error.";
      process.stderr.write(`Error: ${message}\n`);
      process.exitCode = 1;
    }
  );
}
