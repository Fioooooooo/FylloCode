---
sidebar:
  group: Product Features
  order: 25
---

# Multi-root Workspace

A FylloCode Workspace puts multiple Projects in one window and gives Chat, Tasks, and governance data a shared context. For work that spans codebases, an Agent with additional-directory support can read several authorized project directories in one Chat Session. You can keep the discussion in one place instead of switching windows or repeating the relationship between Projects.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/workspace-overview.png" alt="Workspace overview with multiple Projects" />
</figure>

## The problem it solves

A single-project-folder model works well for most single-repository tasks, but cross-project problems often require looking at a caller and a service, an application and a shared library, or code and documentation together. When those directories are opened separately, the Agent receives separate contexts as well, so the user has to switch windows and repeatedly explain how the projects relate.

A multi-root Workspace lets related Projects share one working window. Start one discussion around the problem, let the Agent understand multiple Projects within the authorized scope, and return the result to each Project's own boundary.

## Three core concepts

| Concept | Role |
| --- | --- |
| **Project** | A Workspace member representing one project directory and its stable identity. |
| **Workspace** | A window-level working context containing 1–16 Projects and one primary Project. |
| **Session scope** | The authorization snapshot fixed when a Chat Session is created, including the primary Project and other available authorized Projects. |

A Workspace can start with one Project and grow to include others. Member order and the primary Project affect the directory scope of future Sessions, but they do not change Sessions that already exist.

## How an Agent reads multiple Projects

FylloCode sets the directory scope for a multi-root Chat Session in four steps:

1. Open or create a Workspace in the Launcher and add the Projects you need to work with.
2. When Chat creates a Session, FylloCode records the Workspace members, paths, and primary Project at that moment as a fixed Session scope.
3. If the selected Agent advertises support for additional directories, FylloCode passes the primary Project as the working directory and the other authorized Projects as additional directories to the ACP Session.
4. FylloCode's bundled MCP and file preview use the same authorization scope; the Agent cannot expand read access by submitting arbitrary paths.

Simultaneous access to multiple Projects requires two conditions: the Projects must belong to the current Workspace, and the Agent must support additional-directory capability. If an Agent does not support it, the Session can still run in the primary Project, but it will not access the other Projects.

## A fixed Session scope

A Workspace can be edited, but a running Session does not drift with those edits:

- After a Session is created, adding, removing, reordering, renaming, or relocating a Project does not silently change that Session's directory scope.
- The Chat-header scope popover shows the Projects, paths, and primary-Project marker in the Session snapshot, and warns when the current Workspace differs from it.
- If a snapshot Project is removed, its path disappears, or it is relocated, FylloCode does not silently replace the path or trim the authorization. Resolve the stale state or create a new Session instead.

The Agent therefore sees a stable code boundary throughout the task, and a Workspace edit cannot change work already in progress.

## Multi-root does not mean unbounded writes

Multi-root Workspace solves the shared-context problem without erasing Project ownership:

- A Chat Session can read multiple Projects when the Agent supports it and the authorization is valid.
- Repository-owned content such as Specs, guidelines, Proposals, and Git history remains owned by its Project; multi-root operations must identify the relevant Project.
- Proposal Apply and Archive still run only in the Proposal's owning Project or a registered worktree. Having multiple Workspace members does not make writes cross-project.
- Knowledge belongs to the Workspace and can be shared across Projects, Tasks, and Sessions; repository evidence still retains its Project owner.

To get started, read [Getting Started](/en/docs/guide/getting-started) for opening a Project or Workspace. Then see [Chat and Execution](/en/docs/features/chat) for Session scope, [ACP Agents](/en/docs/features/agents) for Agent capability limits, and [Project Overview](/en/docs/features/overview) for the Workspace aggregate view.
