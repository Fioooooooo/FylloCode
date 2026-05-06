# app-shell-routing Specification

## Purpose

定义应用壳路由结构、根入口重定向规则，以及项目作用域页面的访问约束。

## Requirements

### Requirement: Non-welcome pages share a route-level app shell

The system SHALL provide a route-level parent page for all application pages, and that parent page SHALL render a shared application shell layout with dedicated header, side navigation, and main content regions.

#### Scenario: Shared shell wraps application pages

- **WHEN** the user navigates to `/chat`, `/workflow`, `/integration`, `/proposal`, `/proposal/:id`, or `/settings`
- **THEN** the route is rendered inside the shared application shell
- **AND** the page-specific content is rendered in the shell's main region

### Requirement: Root application entry redirects by current project context

The system SHALL resolve access to `/` by checking the current project context and keeping the user on `/` (which renders WelcomeView) when no project is selected, or redirecting to `/chat` when a project is already selected.

#### Scenario: No project stays on root

- **WHEN** the user navigates to `/` and there is no current project
- **THEN** the application stays on `/` and renders the WelcomeView inside the shared shell

#### Scenario: Current project redirects to chat

- **WHEN** the user navigates to `/` and a current project exists
- **THEN** the application redirects to `/chat`

### Requirement: Application pages require a current project

The system SHALL prevent access to project-scoped application routes when no current project is selected by rendering WelcomeView instead.

#### Scenario: Project-scoped route without project

- **WHEN** the user navigates directly to `/chat`, `/workflow`, `/integration`, `/proposal`, or `/proposal/:id` without a current project
- **THEN** the application renders the WelcomeView in the main content region

### Requirement: Integration page is a project-scoped application route

The system SHALL treat `/integration` as a project-scoped application route protected by the same access constraints as other application pages.

#### Scenario: Integration route requires project

- **WHEN** the user navigates directly to `/integration` without a current project
- **THEN** the application renders the WelcomeView in the main content region

### Requirement: Settings route 与 Activity Bar 高亮

Activity Bar SHALL 包含齿轮图标入口，点击后路由跳转至 `/settings`。当当前路由为 `/settings` 时，Activity Bar 中齿轮图标 SHALL 显示高亮激活状态。

#### Scenario: 点击 Activity Bar 齿轮图标

- **WHEN** 用户点击 Activity Bar 中的齿轮图标
- **THEN** 路由跳转至 `/settings`，齿轮图标高亮

#### Scenario: 离开 Settings 页面

- **WHEN** 用户导航至其他页面
- **THEN** 齿轮图标高亮状态取消
