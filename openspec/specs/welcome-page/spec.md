# welcome-page Specification

## Purpose

定义应用启动时无项目状态下的欢迎内容展示，包括品牌标识、操作按钮和最近项目列表。

## Requirements

### Requirement: Welcome page displays when no project is open

The system SHALL display the Welcome content when no project is currently open, and the Welcome content SHALL render inside the shared application shell.

#### Scenario: User opens app with no project

- **WHEN** the application starts with no active project
- **THEN** the Welcome content is displayed in the main content region
- **AND** the shared application shell header and side navigation are visible

### Requirement: Welcome page shows brand identity

The system SHALL display the FylloCode logo, product name, and tagline centered at the top of the Welcome content.

#### Scenario: Brand identity is visible

- **WHEN** the Welcome content is displayed
- **THEN** the logo, "FylloCode" text, and tagline "Autonomous Coding Workflow" are visible
- **AND** they are horizontally centered

### Requirement: Welcome page provides action buttons

The system SHALL display two side-by-side action buttons below the brand identity.

#### Scenario: Action buttons are visible

- **WHEN** the Welcome content is displayed
- **THEN** an "Open Folder" button and a "Create Project" button are shown side by side
- **AND** the "Open Folder" button is styled as a primary solid button
- **AND** the "Create Project" button is styled as a secondary outlined button
- **AND** each button has an icon on the left side

#### Scenario: Open Folder button is clicked

- **WHEN** user clicks the "Open Folder" button
- **THEN** a directory selection dialog is invoked
- **AND** upon selection, the current project context is updated
- **AND** the system enters `/workspace`

#### Scenario: Create Project button is clicked

- **WHEN** user clicks the "Create Project" button
- **THEN** a project creation modal is opened

### Requirement: Welcome page handles empty recent projects state

The system SHALL display an empty state message when no recent projects exist.

#### Scenario: No recent projects

- **WHEN** the Welcome content is displayed and no recent projects exist
- **THEN** a message "No recent projects. Open a folder or create a new project to get started." is shown
- **AND** the recent projects list is not displayed

## REMOVED Requirements

### Requirement: Welcome page is standalone route

**Reason**: Welcome content is now embedded in the shared application shell, no longer a standalone `/welcome` route.

**Migration**: The `/welcome` route is removed. Users without a project will see Welcome content at `/`.
