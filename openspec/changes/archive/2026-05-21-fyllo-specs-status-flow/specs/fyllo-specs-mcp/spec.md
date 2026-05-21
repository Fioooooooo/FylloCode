## ADDED Requirements

### Requirement: create-proposal must close creating state to draft

`create-proposal` tool SHALL keep `creating` as the initial intermediate state for a new change, but its prompt SHALL explicitly require the agent to update the corresponding `.openspec.yaml` `status` to `draft` after all required artifacts are complete. The agent SHALL perform that write-back inside the creation workflow and SHALL NOT depend on a second `create-proposal` invocation.

#### Scenario: proposal creation finishes

- **WHEN** the agent finishes all required artifacts for a change created through `create-proposal`
- **THEN** the agent writes `.openspec.yaml` with `status: draft` before stopping the creation workflow
- **AND** the resulting proposal can be treated as ready for implementation in proposal list and detail views

#### Scenario: creating is only transitional

- **WHEN** a proposal is still in `creating`
- **THEN** it SHALL NOT be treated as the final actionable state for implementation
- **AND** `create-proposal` prompt SHALL instruct the agent to complete artifacts first and then write back `draft`

### Requirement: explore is read-only

`explore` tool SHALL NOT modify proposal `.openspec.yaml` state and SHALL NOT perform any lifecycle transition. It only returns exploratory instructions and state.

#### Scenario: explore does not mutate status

- **WHEN** the agent calls `explore` in any phase of a proposal lifecycle
- **THEN** the call SHALL NOT change `creating` into `draft`
- **AND** the call SHALL NOT modify any proposal files
