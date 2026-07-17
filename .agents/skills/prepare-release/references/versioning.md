# Release Versioning

Use Semantic Versioning syntax, but apply separate decision ownership to the FylloCode application and each bundled MCP server.

## Application Version

The user owns the FylloCode application version.

- Require the user to provide the exact version, such as `0.15.0` or `0.15.0-beta.1`.
- Do not infer, recommend, upgrade, downgrade, or rewrite the application version from commit types, feature count, compatibility impact, or release size.
- If the application version is missing, ask one concise question for it before changing release artifacts.
- Validate that the value is valid SemVer, the corresponding `vX.Y.Z` tag does not already exist, and the version is consistent with the intended release line.
- Use the same application version in `package.json`, both root changelogs, release notes, the release commit subject, and the Git tag.

## MCP Server Decision Boundary

Derive each bundled MCP server version independently from that server's shipped changes. Do not synchronize server versions with the application or with each other.

Treat these as external MCP contract boundaries:

- tool names, modes, and availability;
- required and optional input fields, validation, defaults, and accepted values;
- result shape, state fields, status values, errors, and failure behavior;
- environment variables, storage locations, workspace behavior, and other caller-visible operational contracts;
- tool instructions or prompt contracts when their semantics change what an Agent or caller must do;
- compatibility guarantees documented for integrations or existing consumers.

Use implementation, tests, active specs, archived deltas, and the server changelog as evidence. Commit prefixes are hints, not the versioning decision.

## Current `0.x` Server Rules

Both bundled MCP servers are currently below `1.0.0`. Apply these project rules:

| Highest shipped change                                                                                                                | Version action                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| No change to this server                                                                                                              | Keep the current version                                                     |
| Contract-preserving bug fix, internal refactor, test-only change, documentation correction, or instruction clarification              | Increment patch: `0.Y.Z` → `0.Y.(Z+1)`                                       |
| Backward-compatible tool, mode, optional input, output, or substantial behavior addition                                              | Increment minor and reset patch: `0.Y.Z` → `0.(Y+1).0`                       |
| Removed or renamed tool/mode, new required input, incompatible result/error/default/storage change, or other breaking contract change | Increment minor and reset patch, then mark the change explicitly as breaking |

For `0.x`, both compatible feature additions and breaking contract changes use a minor increment. The bundled server changelog and both root changelogs must distinguish a breaking change explicitly because the number alone cannot.

When a release contains multiple server changes, use the highest applicable boundary. A compatible fix does not reduce a required minor bump.

## Rules After a Server Reaches `1.0.0`

Apply standard SemVer:

- patch for backward-compatible fixes with no public contract addition;
- minor for backward-compatible public contract additions or deprecations;
- major for any backward-incompatible public contract change.

Reset lower-order components when incrementing minor or major.

## Examples

- Fix an internal archive status bug without changing inputs, outputs, or documented semantics: `0.8.1` → `0.8.2`.
- Add a new optional mode or tool while preserving existing callers: `0.8.1` → `0.9.0`.
- Rename a tool or make an optional field required while still below `1.0.0`: `0.8.1` → `0.9.0`, with an explicit breaking-change and migration note in the bundled server and root changelogs.
- Make the same incompatible change after `1.0.0`: `1.4.2` → `2.0.0`.
- Change only the other bundled MCP server: keep this server's version unchanged.

## Required Versioning Record

For each server, record:

- current version;
- changed or unchanged status;
- highest affected contract boundary;
- evidence paths or archived change;
- derived next version;
- whether a breaking or migration note is required in the changelogs.

Update the server version constant and its changelog atomically. Mention every bumped bundled server version in both root changelogs and verify all values before the release commit.
