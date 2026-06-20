---
sidebar:
  group: Product Features
  order: 80
---

# Engineering Integrations

FylloCode does not aim to create another task island. Its goal is to write Agent work results back into the engineering systems your team already uses.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/integration-provider.png" alt="Integration provider page screenshot" />
</figure>

## Integration Providers

The provider page manages global provider credentials. The current focus is Yunxiao, with future room for GitHub, GitLab, Jira, Linear, and other systems.

The page shows:

- Provider connection state
- Detected account
- Credential echo
- Disconnect entry point
- Placeholders for providers that are not open yet

## Tool Integrations

<figure class="fc-doc-image">
  <img src="/assets/screenshots/integration.png" alt="Integration tool page screenshot" />
</figure>

The integration page manages project-level tool capabilities such as task reading, result writeback, repository association, and pipeline association. Different providers may expose different tools.

## Current Focus

The first integration batch prioritizes Yunxiao. Other systems are planned or reserved, so docs and UI should not promise automation that is not implemented yet.
