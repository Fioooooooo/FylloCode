# Manual packaged-app validation

## Status

Accepted by the user on 2026-08-04 after manually building and exercising both the linked baseline worktree and the optimized main worktree. The coding-agent session remained hosted by the running FylloCode `.app`, so all packaged launches, quits and visual observations were performed by the user rather than by the Agent.

## Build and artifact

On the current Apple Silicon machine, run:

```bash
pnpm build:mac:arm64
find dist -maxdepth 3 -name FylloCode.app -print
```

Record the actual `.app` path returned by `find`; do not assume the output directory if electron-builder changes it.

## Isolated profiles

- Quit every existing FylloCode instance before each sample so single-instance routing does not contaminate timing.
- Launch the packaged executable from Terminal with a dedicated `--user-data-dir` under a newly created temporary directory. Never point validation at the real FylloCode profile.
- Cold samples: use a fresh isolated profile for every run.
- Warm samples: reuse one separate isolated profile for all runs.
- Repeat cold and warm samples at least three times each.

## Measurements

For every sample, retain the isolated profile's Electron log and extract only structured `[lifecycle-metric]` records. Record:

- `process-entry` → `startup-visible` → `renderer-interactive`;
- `shutdown-requested` → `windows-hidden` → process exit;
- whether the 4-second shutdown deadline or any failed/timeout phase was reported.

Use the repository summarizer to group mixed baseline/optimized logs and calculate sample statistics:

```bash
node scripts/summarize-lifecycle-metrics.mjs /absolute/path/to/main.log
```

Archive the active log before switching builds or metric granularity. Do not combine optimized
samples created before per-phase/per-task shutdown timing with samples created after that timing was
added; headline first-window, interactive, immediate-hide, and total-shutdown values remain valid,
but their detailed phase summaries use different measurement points.

Before requesting quit, record the Electron PID and its descendant PID/PGID/command table. After exit, check every previously recorded ACP, bundled MCP and installer descendant PID explicitly; none may remain alive. Do not use a broad process-name kill as proof.

## Visual and lifecycle checks

- Light theme, dark theme and `prefers-reduced-motion` all show the static shell without a white flash.
- The same window transitions from static shell to Vue loading and then to Launcher/Workspace content.
- Reduced motion stops ring and Logo animation.
- A second launch focuses the existing startup/formal window instead of creating a second runtime.
- Quitting hides all windows immediately, saves window state once and does not recreate a window.

## Migration-failure isolation

The repository currently has unit-test fixtures for migration failure but no packaged-app fixture switch. Do not corrupt a real profile or invent an undocumented environment variable. Perform this check only after preparing a disposable profile whose `migrations/migrations.json` and legacy data were copied from a reviewed fixture; record the fixture construction steps with the result. Expected behavior: the startup shell closes before the native upgrade-failure dialog, and no business IPC, bundled MCP, workflow initialization or ACP warmup starts.

## Acceptance record

- Baseline: the user built the `origin/main` linked-worktree instrumented version and collected five lifecycle samples before testing the optimized build.
- Optimized: the user built the current main-worktree version and collected five lifecycle samples.
- Median first-window duration improved from 995.3 ms to 177.3 ms (82.2% reduction, approximately 5.6× faster).
- Median full shutdown duration improved from 3016.8 ms to 1035.5 ms (65.7% reduction, approximately 2.9× faster).
- Optimized visible window hide occurred in approximately 13.9 ms; the baseline visible exit tracked the approximately 3016.8 ms full shutdown path.
- Before quit, the user captured the FylloCode main process, Electron Helpers, ACP processes and their MCP descendants by PID/PPID/PGID. The post-exit PID liveness check reported that every captured FylloCode, ACP, MCP and Helper process had exited.
- The user manually reviewed the centered static startup shell, same-window Vue handoff and refined meteor loading treatment, then confirmed that the result had no material remaining issue.
- A packaged migration-failure profile was not intentionally corrupted during this session; its gate/no-side-effect behavior remains covered by focused main-process fixtures and tests. The user explicitly accepted this limitation when authorizing archive.
- These measurements are an implementation acceptance record, not a permanent product SLO.
