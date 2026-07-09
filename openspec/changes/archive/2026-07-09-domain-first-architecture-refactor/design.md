## Context

FylloCode 当前请求路径是 renderer UI -> renderer API wrapper -> `window.api` preload API -> shared IPC channel/schema -> main IPC handler -> main service -> main domain/infra。现有路径已经具备分层，但目录和公开名称仍以扁平 capability 为主，例如 `window.api.chat.*`、`window.api.proposal.*`、`chat:*`、`proposal:*`、`src/main/services/chat/**`、`src/renderer/src/stores/session.ts`。

本设计将架构迁移为 domain-first：统一六个领域 `platform`、`workspace`、`session`、`proposal`、`insight`、`automation`，并让跨进程 API 与 IPC channel 从名称上体现领域归属。它不是业务重写，不改变现有业务流程、持久化格式、页面状态语义或数据模型。

约束来源：

- `guidelines/Architecture.md` 要求跨进程 contract 放在 `src/shared/**`，renderer 通过 wrapper 调用 preload。
- `guidelines/MainProcess.md` 要求 IPC handler 通过 services 访问业务能力，`src/main/domain/**` 保持纯净，`src/main/infra/**` 不反向依赖 services。
- `guidelines/RendererProcess.md` 要求 renderer 通过 `src/renderer/src/api/**` wrapper 访问 preload，复用异步/UI 状态放在 Pinia store 中。
- `guidelines/Testing.md` 要求测试在 `test/` 下镜像相关 `src/` 区域。
- `guidelines/QualityGates.md` 要求 lint/typecheck/test/build 作为质量门禁。

## Goals / Non-Goals

**Goals:**

- 将 preload API 迁移为 `window.api.<domain>.<area>.<action>()`。
- 将 IPC channel 迁移为 `<domain>:<area>:<action>`。
- 按六领域 taxonomy 组织 shared IPC contracts、main IPC handlers、preload APIs、renderer API wrappers、main services、main pure domain helpers 和 renderer stores。
- 在 main service 层建立 `src/main/services/<domain>/_public` 作为唯一跨领域 import 入口，并通过 lint 强制。
- 在 renderer 层建立 store/API wrapper/page 的跨领域 import 约束，并通过 lint 强制。
- 保持现有业务语义、持久化路径、JSON 格式、页面默认/加载/空/错误状态不变。
- 移动对应测试，使 `test/` 继续镜像迁移后的 `src/` 结构。
- 文件移动和重命名尽可能保留 Git rename 识别与 `git blame` 历史。
- 更新 guidelines，使实施后的工程规则可被后续 agent 继承。

**Non-Goals:**

- 不重写 proposal apply/archive 的业务流程或 stream 协议。
- 不改变 task/session/lineage/proposal/workflow/integration 的业务语义。
- 不改变本地持久化 storage path、JSON key 或 JSON schema；如发现无法保持兼容，必须停止并提出单独迁移设计。
- 不改变用户可见页面布局、默认状态、空状态、错误状态或文案。
- 不引入新的运行时依赖；如 lint 需要自定义能力，优先使用现有 ESLint flat config 能表达的规则或本地轻量规则。
- 不把 renderer store 强制拆成与 main service 或 public API area 一一对应。

## Decisions

### 1. 六领域 taxonomy

最终领域和 area：

| Domain       | Areas                                                  | 说明                                                                            |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `platform`   | `app`, `settings`, `release`, `acpAgents`, `providers` | 全局应用能力、设置、版本检查、ACP agent、全局 provider 连接/registry/resource。 |
| `workspace`  | `project`, `window`                                    | 项目标识、项目窗口、launcher/project context。                                  |
| `session`    | `chat`                                                 | chat session、stream、draft probe、message attachment。                         |
| `proposal`   | `browser`, `apply`, `archive`                          | proposal list/detail/status、apply run、archive run。                           |
| `insight`    | `overview`, `specs`, `guidelines`, `lineage`           | governance/read-model、spec/guideline 浏览、lineage/provenance。                |
| `automation` | `workflow`, `task`, `projectIntegration`               | workflow、local task、项目级 integration mapping。                              |

理由：这些领域与产品语义和页面所有权一致，可以把 `acp-agents` 放到 `platform`，把 provider 全局连接和 project integration mapping 分开，避免 `proposal.proposal` 这类重复命名。

替代方案：沿用当前 `acp/chat/lineage/workflow` taxonomy。拒绝原因：它只覆盖部分 main pure domain helper，不能表达 preload/API/store/service 的完整所有权。

### 2. `window.api` 与 renderer API wrapper 镜像 public contract

最终公开形状：

```ts
window.api.platform.settings.*
window.api.platform.release.checkLatestRelease(...)
window.api.workspace.project.*
window.api.workspace.window.*
window.api.session.chat.*
window.api.proposal.browser.*
window.api.proposal.apply.*
window.api.proposal.archive.*
window.api.insight.overview.*
window.api.insight.specs.*
window.api.insight.guidelines.*
window.api.insight.lineage.*
window.api.automation.workflow.*
window.api.automation.task.*
window.api.automation.projectIntegration.*
```

renderer wrapper 位于 `src/renderer/src/api/<domain>/<area>.ts`，并成为唯一直接调用 `window.api.<domain>.<area>` 的 renderer 代码。最终状态不保留旧 flat alias。

release API 选择：使用 `platform.release.checkLatestRelease(...)`，不再通过 `platform.settings` 暴露 release check。该选择只改变 public API 位置，不改变 `release-version-service` 的业务逻辑。

替代方案：保留 `platform.settings.checkLatestRelease(...)`。拒绝原因：它减少 contract delta，但会让 `release` 作为 global app capability 的 area 边界不清晰。

### 3. IPC channel 编码 domain 和 area

所有 request/response channel、event channel、stream port/cancel channel 使用 `<domain>:<area>:<action>`：

```ts
"session:chat:listSessions";
"session:chat:stream:message";
"session:chat:stream:port";
"session:chat:stream:cancel";
"proposal:browser:list";
"proposal:apply:stageStream";
"proposal:apply:stageStream:port";
"proposal:apply:stageStream:cancel";
"proposal:archive:archive";
"platform:settings:get";
"platform:release:checkLatestRelease";
```

shared contract 放到 `src/shared/ipc/<domain>/<area>.channels.ts` 和 `src/shared/ipc/<domain>/<area>.schemas.ts`。可保留短期 compatibility re-export，但 final-state tests 不应引用旧 flat channel。

### 4. Main service 只共享 domain，不与 public API 强制同形

`src/main/services/<domain>/**` 按主进程 use case、IO 能力和 infra 组合拆分。service 文件不需要与 public API area 或 renderer store 一一对应。

每个需要被其他 domain 复用的 service domain 可以有根级 `_public/index.ts`：

```text
src/main/services/session/
  _public/index.ts
  chat/acp-stream-driver.ts
  chat/session-registry.ts
  chat/chat-service.ts
```

跨 domain 只能 import：

```ts
import { driveSessionStream } from "@main/services/session/_public";
```

不能 import：

```ts
import { driveAcpStream } from "@main/services/session/chat/acp-stream-driver";
import { chatFacade } from "@main/services/session/chat/chat-facade";
```

`_public` 规则：

- 只能存在于 `src/main/services/<domain>/_public`，不能存在于 area 下。
- 必须显式 export 稳定方法，禁止 `export *`。
- 自身不得 import 其他 product domain service。
- 可导出 lower-level capability wrapper；不是 IPC service，也不是默认业务 facade。
- `area-facade.ts` 可以作为 owner domain 内部完整业务动作编排文件存在，但其他 domain 调用它时必须通过 `_public` 显式 export 的窄方法进入。

### 5. Renderer store 只共享 domain，不与 service tree 强制同形

`src/renderer/src/stores/<domain>/**` 按 UI state、页面 workflow 和复用边界建模。

示例：

- `platform/release.ts` 不是必需文件。若 release check 只服务 settings 页，可作为 `platform/settings.ts` 的 action；只有出现独立 release banner、更新状态缓存或 release 页面时才建 release store。
- `proposal/run.ts` 可以统一管理 apply/archive 的 run UI 状态，即使 transport API 拆成 `proposal.apply` 和 `proposal.archive`。
- `session/session.ts` 可以管理当前会话 workflow，`session/chat.ts` 管理 chat list/message 状态，不需要复制 main 的多个 chat helper 文件。

页面只 import 自己所属领域的 store。跨领域行为通过自己领域 store 的 action 组合目标领域 store/facade，不直接在页面层组合无关领域 store。

### 6. Pure main domain helper 重新映射

`src/main/domain/**` 保持纯净，并迁移到六领域 taxonomy：

| 当前                                  | 目标                                                           |
| ------------------------------------- | -------------------------------------------------------------- |
| `domain/acp/agent-kind-map.ts`        | `domain/platform/acp-agent/**`                                 |
| `domain/chat/acp-session-store.ts`    | `domain/session/chat/**` 或共享 stream runtime                 |
| `domain/chat/acp-session-recovery.ts` | `domain/session/chat/**` 或共享 stream runtime                 |
| `domain/chat/message-assembler.ts`    | `domain/session/chat/**` 或共享 stream runtime                 |
| `domain/chat/session-events.ts`       | `domain/session/chat/**` 或共享 stream runtime                 |
| `domain/chat/system-reminder-wrap.ts` | `domain/session/chat/**` 或 `domain/platform/agent-runtime/**` |
| `domain/lineage/**`                   | `domain/insight/lineage/**`                                    |
| `domain/workflow/yaml-parser.ts`      | `domain/automation/workflow/**`                                |

迁移时解决 `services/chat/message-assembler.ts` 与 `domain/chat/message-assembler.ts` 的重复关系：最终只有一个真实实现，最多保留短期 compatibility re-export。

### 7. 持久化兼容性先盘点后移动

实现前盘点 storage path 和 schema 常量。已知必须保持兼容的区域包括：

- `integrations/credentials`
- `integrations/connections.json`
- 每个项目的 `integrations/config.json`
- `window-state`
- 每个项目的 `lineage` index/subjects
- task、workflow、apply-run、session、MCP event、ACP process/cache state

移动 storage-backed service 时不得改变 path/key/schema。若发现现有 path 与模块路径耦合且无法保持兼容，停止该任务并补充迁移 proposal。

### 8. Lint 约束把约定变成硬边界

更新 `eslint.config.mjs`，至少覆盖：

- renderer non-wrapper code 禁止直接调用 `window.api`。
- renderer store 禁止 import 其他 domain 的 renderer API wrapper。
- page/component 禁止 import 无关 product domain store。
- main service 跨 domain import 只能指向 `@main/services/<target-domain>/_public`。
- 禁止 area-level `_public`：`src/main/services/<domain>/<area>/_public/**`。
- `src/main/services/<domain>/_public/**` 禁止 import 其他 product domain service。
- `src/main/services/<domain>/_public/**` 禁止 `export *`。
- main IPC handler 不直接 value-import infra capability，批准例外除外。

可用 `no-restricted-imports` 覆盖大部分路径规则；`ExportAllDeclaration` 和 area-level `_public` 可通过本地 ESLint rule 或现有 selector rule 实现。若需要新增依赖，必须在 tasks 中显式记录。

### 9. 文件移动优先保留 Git 历史

本重构会移动大量文件。实现时应优先使用 `git mv`，或使用 Git 能识别为 rename 的等效移动方式，避免通过“新建目标文件 + 删除原文件”的方式重写历史。

规则：

- 纯移动或重命名时，先执行文件移动，再在目标路径做 import/path/name 调整。
- 大文件拆分时，优先保留原文件作为主要实现的移动目标，再从中抽取新文件；不要把原文件整体删除后在多个新文件中重写。
- 若需要短期 compatibility re-export，保留一个很薄的 re-export 文件即可，不要复制实现。
- 完成一批移动后，用 `git status --short` 和 `git diff --find-renames --summary` 检查 Git 是否能识别 rename。
- `test/` 镜像文件与生产文件同步移动，尽量保持测试文件历史。

## Risks / Trade-offs

- [API/channel contract break] -> 先增加 preload shape、channel snapshot 和 IPC registration 测试，再移动实现；最终不保留 flat alias。
- [storage compatibility regression] -> Phase 0/1 先盘点并增加 storage path/schema 回归测试；实现中不得改 path/key/schema。
- [`_public` 漂移成内部批量出口] -> lint 禁止 `export *`，并禁止 `_public` import 其他 product domain service。
- [store 被误拆成 service tree 镜像] -> design、tasks 和 guidelines 明确 store 按 UI/workflow ownership 建模。
- [大量文件移动导致 blame 丢失] -> 使用 `git mv` 或 Git 可识别 rename 的移动方式，先移动再编辑，并用 `git diff --find-renames --summary` 检查。
- [单次 Apply 体量大] -> tasks 按可回滚 batch 分组；每组完成后跑对应测试，最终跑 lint/typecheck/test/build。
- [旧 spec/docs/comments 遗留旧 channel 文本] -> tasks 要求全库 grep 并分类更新 active contract text，历史/归档文本可保留。

## Migration Plan

1. 建立 contract tests：preload root shape、channel constant snapshot、IPC registration、storage path/schema compatibility。
2. 使用 `git mv` 或 Git 可识别 rename 的方式移动 shared IPC contracts 到 `src/shared/ipc/<domain>/<area>.*`，再更新 channel string。
3. 移动 main IPC handlers 到 `src/main/ipc/<domain>/<area>.ts`，清理 IPC 直接依赖 infra 的情况。
4. 移动 main services 到 `src/main/services/<domain>/**`，建立 `_public` 出口，拆分 provider/project integration ownership。
5. 重新映射 `src/main/domain/**` pure helpers 并移动镜像测试。
6. 移动 preload APIs，暴露最终 `window.api.<domain>.<area>`，移除 flat alias。
7. 移动 renderer API wrappers，更新所有 wrapper 到新 preload shape。
8. 移动 renderer stores/pages/components，按 domain ownership 清理跨领域 store/API wrapper import。
9. 增加 ESLint guard 并更新 guidelines。
10. 全库 grep 旧 channel 和旧 `window.api.<area>` 引用；更新 active contract/test/code/doc，保留历史/归档文本。
11. 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。

## Open Questions

- 若实现发现某个 storage path 实际由模块路径派生，是否保持兼容需要额外 migration；本 proposal 不预设迁移，应在发现时停止并补充设计。
- ACP stream runtime 最终放在 `session/chat`、`proposal/runtime` 还是独立 pure runtime helper，需要以实际 import 关系和 purity 判断；无论选择哪种，不能保留重复实现。
