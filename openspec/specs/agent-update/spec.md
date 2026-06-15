# agent-update 规范

## Purpose

管理已安装 CLI agent 的版本检测与更新流程，区分 FylloCode 管理与用户自管理两种场景。

## Requirements

### Requirement: 更新可用检测

主进程在 `detectStatus` 时 SHALL 将已安装版本与 registry 中的版本做 semver 比较，若 registry 版本更高则标记 `updateAvailable: true`。

#### Scenario: 有新版本可用

- **WHEN** `detectStatus` 执行，某 agent `installed: true`，且 registry 中该 agent 的 `version` 高于 `detectedVersion`
- **THEN** 该 agent 的状态包含 `updateAvailable: true, latestVersion: <registry 版本>`

#### Scenario: 已是最新版本

- **WHEN** `detectStatus` 执行，某 agent `installed: true`，且 `detectedVersion >= registry version`
- **THEN** 该 agent 的状态包含 `updateAvailable: false`

### Requirement: FylloCode 管理的 agent 一键更新

对 `managedBy: "fyllocode"` 的 agent，SHALL 允许直接调用 `acp:install` 执行更新（覆盖安装），无需额外确认。

#### Scenario: 一键更新

- **WHEN** 用户点击 `managedBy: "fyllocode"` 且 `updateAvailable: true` 的 agent 的"更新"按钮
- **THEN** 前端调用 `acp:install`，流程与首次安装相同，完成后 `installed.json` 中 `installedVersion` 更新为新版本

### Requirement: 用户自管理 agent 更新需二次确认

对 `managedBy: "user"` 的 agent，更新前 SHALL 展示确认对话框，告知用户"此 agent 将由 FylloCode 接管管理"，用户确认后才执行安装。

#### Scenario: 用户确认接管更新

- **WHEN** 用户点击 `managedBy: "user"` 且 `updateAvailable: true` 的 agent 的"更新"按钮，并在确认对话框中点击"确认"
- **THEN** 前端调用 `acp:install`，安装完成后 `installed.json` 中 `managedBy` 更新为 `"fyllocode"`

#### Scenario: 用户取消接管更新

- **WHEN** 用户点击"更新"按钮后，在确认对话框中点击"取消"
- **THEN** 不执行安装，agent 状态不变
