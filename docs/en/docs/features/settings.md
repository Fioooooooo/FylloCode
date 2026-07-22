---
sidebar:
  group: Product Features
  order: 90
---

# Settings

Settings centralizes FylloCode application preferences, ACP Agents, global service connections, and version information. The ActivityBar entry remains `/settings`, which opens the default `/settings/preferences` page.

## Pages and Paths

The Settings sidebar uses a fixed order and switches between four independent pages inside one shared layout:

| Page | Path | Purpose |
| --- | --- | --- |
| Preferences | `/settings/preferences` | Configure theme, language, default Agent mode, session autosave, notifications, and token statistics options. |
| Agents | `/settings/acp-agents` | Search, install, update, detect, and configure ACP Agents. |
| Service Connections | `/settings/connections` | Manage global provider credentials and connection state. |
| About | `/settings/about` | View the application version and release check result. |

The ActivityBar Settings item remains active on every `/settings/*` page. Child pages do not add top-level navigation items.

## Targeting a Service Connection

The Service Connections page accepts a `focus` query parameter. When a project integration needs a provider configuration, it opens `/settings/connections?focus=<providerId>`. After provider data loads and connection probes finish, the page scrolls to and focuses the corresponding card. Without `focus`, the page shows the complete connection list.

Service Connections changes only the user-facing terminology and navigation path. Internal `Provider`, `ProviderConnection`, store, and API contracts remain unchanged. See [Engineering Integrations](/en/docs/features/integrations) for project-level tool configuration.

## Path Compatibility

`/settings?tab=integration-providers`, `/settings?tab=preferences`, and `/settings?tab=about` no longer select a Settings section and are not redirected to the new child routes. Opening `/settings` with an old `tab` parameter follows the default behavior and enters `/settings/preferences`.

Use the independent child routes in the table when linking directly to a Settings page.
