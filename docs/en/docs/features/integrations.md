---
sidebar:
  group: Product Features
  order: 80
---

# Engineering Integrations

FylloCode does not aim to create another task island. Its goal is to write Agent work results back into the engineering systems your team already uses.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/integration-provider.png" alt="Service Connections page screenshot" />
</figure>

## Service Connections

The Service Connections page under [Settings](/en/docs/features/settings) is available at `/settings/connections`. It manages global provider credentials and connection state. The implemented connection flow currently focuses on Yunxiao. Unavailable providers shown on the page are reserved positions, not release commitments.

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

The Workspace integration page manages tool capabilities across Projects, such as task reading, result writeback, repository association, and pipeline association. Resources that access a repository are explicitly bound to a Project in the Workspace; removed members remain as stale bindings so historical data is not mistaken for a current resource. Different providers may expose different tools. When a provider is disconnected or its connection expires, the page opens `/settings/connections?focus=<providerId>` to locate the corresponding service connection.

## Current Focus

Treat the connection state and Project-bound tools shown in the application as the available capability. A placeholder for an unavailable provider does not mean connection, task synchronization, or result writeback is supported.
