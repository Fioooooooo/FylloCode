import { readFileSync } from "node:fs";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: node scripts/summarize-lifecycle-metrics.mjs <main.log> [...main.log]");
  process.exitCode = 1;
} else {
  for (const path of paths) summarize(path);
}

function parseJsonAfter(line, marker) {
  const start = line.indexOf(marker);
  if (start === -1) return null;
  try {
    return JSON.parse(line.slice(start + marker.length));
  } catch {
    return null;
  }
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function statistics(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return {
    samples: values.length,
    minMs: round(sorted[0]),
    medianMs: round(median),
    meanMs: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    maxMs: round(sorted.at(-1)),
  };
}

function valueAfter(run, phase, fromPhase) {
  const value = run.phases.get(phase)?.durationMs;
  if (value === undefined) return null;
  const baseline = fromPhase ? run.phases.get(fromPhase)?.durationMs : 0;
  return baseline === undefined ? null : round(value - baseline);
}

function detectVariant(run) {
  return run.phases.has("single-instance-lock") || run.phases.has("startup-page-loaded")
    ? "optimized"
    : "baseline";
}

function buildSummary(samples, runs) {
  const headline = Object.fromEntries(
    [
      "firstWindowMs",
      "formalRendererMs",
      "rendererInteractiveMs",
      "shutdownWindowHideMs",
      "shutdownQuiesceMs",
      "shutdownTerminateMs",
      "shutdownFinalizeMs",
      "shutdownCompleteMs",
    ].map((key) => [
      key,
      statistics(samples.map((sample) => sample[key]).filter((value) => value !== null)),
    ])
  );
  const phaseNames = new Set(runs.flatMap((run) => [...run.phases.keys()]));
  const phaseElapsed = Object.fromEntries(
    [...phaseNames].map((phase) => [
      phase,
      statistics(
        samples.map((sample) => sample.phaseElapsedMs[phase]).filter((value) => value !== undefined)
      ),
    ])
  );
  const taskNames = new Set(runs.flatMap((run) => run.tasks.map((task) => task.name)));
  const disposeTasks = Object.fromEntries(
    [...taskNames].map((name) => [
      name,
      statistics(
        runs
          .flatMap((run) => run.tasks)
          .filter((task) => task.name === name)
          .map((task) => task.durationMs)
      ),
    ])
  );
  return { headline, phaseElapsed, disposeTasks };
}

function summarize(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const runs = [];
  let current = null;

  for (const line of lines) {
    const metric = parseJsonAfter(line, "[lifecycle-metric] ");
    if (metric?.phase === "process-entry") {
      current = { phases: new Map(), tasks: [] };
      runs.push(current);
    }
    if (metric && current) current.phases.set(metric.phase, metric);

    const task = parseJsonAfter(line, "[lifecycle-task] ");
    if (task && current) current.tasks.push(task);
  }

  const samples = runs.map((run, index) => ({
    run: index + 1,
    variant: detectVariant(run),
    phaseElapsedMs: Object.fromEntries(
      [...run.phases].map(([phase, metric]) => [phase, metric.durationMs])
    ),
    phaseResults: Object.fromEntries(
      [...run.phases].map(([phase, metric]) => [phase, metric.result])
    ),
    firstWindowMs: valueAfter(run, "startup-visible"),
    formalRendererMs: valueAfter(run, "formal-renderer-loaded"),
    rendererInteractiveMs: valueAfter(run, "renderer-interactive"),
    shutdownWindowHideMs: valueAfter(run, "windows-hidden", "shutdown-requested"),
    shutdownQuiesceMs: valueAfter(run, "shutdown-quiesce", "shutdown-snapshot-and-hide"),
    shutdownTerminateMs: valueAfter(run, "shutdown-terminate", "shutdown-quiesce"),
    shutdownFinalizeMs: valueAfter(run, "shutdown-finalize", "shutdown-terminate"),
    shutdownCompleteMs: valueAfter(run, "shutdown-complete", "shutdown-requested"),
    disposeTasks: run.tasks,
  }));

  const summaries = {};
  for (const variant of ["baseline", "optimized"]) {
    const variantRuns = runs.filter((run) => detectVariant(run) === variant);
    if (variantRuns.length === 0) continue;
    const variantSamples = samples.filter((sample) => sample.variant === variant);
    summaries[variant] = buildSummary(variantSamples, variantRuns);
  }

  console.log(JSON.stringify({ path, samples, summaries }, null, 2));
}
