# 主进程分层规范（MainProcess）

`electron/main/` 按五层架构组织，层间依赖方向单向，任何跨层改动都必须遵守本文档。
ESLint `no-restricted-imports` 会在构建期阻断违规导入。

## 层次与职责

```
electron/main/
├── bootstrap/    # 应用生命周期：窗口创建、before-quit、disposable 注册中心
├── ipc/          # IPC handler（零业务逻辑）+ _kit 共享基础设施
│   └── _kit/     # wrap-handler / stream-channel / errors / schema
├── services/     # 应用服务：跨领域编排、持久化协调、事件广播
├── domain/       # 领域纯逻辑与契约（无 electron / infra 依赖，可脱机单测）
└── infra/        # 基础设施适配器（storage / process / paths / logger / ids）
```

| 层        | 允许依赖                               | 禁止依赖                                              | 示例                                                           |
| --------- | -------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| bootstrap | ipc / services / infra / @shared       | —                                                     | `lifecycle.ts`、`window.ts`、`index.ts`                        |
| ipc       | services / shared / `ipc/_kit`         | fs / child_process / infra / domain（type-only 例外） | `chat.ts`、`proposal-apply.ts`                                 |
| services  | domain / infra / shared                | ipc（`_kit` 除外）、bootstrap                         | `chat-service.ts`、`apply-run-service.ts`                      |
| domain    | shared / 第三方 npm                    | electron / @electron-toolkit / services / infra / ipc | `message-assembler.ts`、`yaml-parser.ts`、`openspec-reader.ts` |
| infra     | shared / 第三方 npm / domain（纯函数） | services / ipc                                        | `project-store.ts`、`acp-process-pool.ts`                      |

**例外**：

- `infra/logger` 是横切能力，`ipc/` 可直接 import。
- `domain/acp/detector.ts`、`domain/integration/yunxiao/**` 历史原因混合了 IO，暂时在 ESLint 白名单中，后续单独拆分。

## IPC 基础设施 `ipc/_kit/`

所有 IPC handler **必须** 通过 kit 四件套实现：

### `wrap-handler.ts`

请求-响应 handler 的唯一正确写法：

```ts
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { listProposalsInputSchema } from "@shared/schemas/ipc/proposal";
import { listProposals } from "@main/services/proposal/proposal-service";

ipcMain.handle(ProposalChannels.list, (_event, input: unknown) =>
  wrapHandler(async () => {
    const { projectId } = validate(listProposalsInputSchema, input);
    return listProposals(projectId);
  })
);
```

handler 函数体只做三件事：**validate → call service → return**。

- 禁止在 handler 内 `new AcpSession`、`fs.*`、`spawn`、`path.join + encodeProjectPath`。
- 禁止手写 `try { ... } catch { return { ok: false, error } }`：`wrapHandler` 已经做完。

### `stream-channel.ts`

流式 handler 的唯一正确写法：

```ts
ipcMain.handle(ChatStreamChannels.streamMessage, (event, input: unknown) => {
  const form = validate(streamMessageInputSchema, input);

  return makeStreamChannel({
    event,
    portChannel: ChatStreamChannels.streamPort,
    logTag: "chat",
    onReady: async (sink) => {
      const session = new AcpSession({ ... });
      sessionRegistry.register("chat", sessionId, session);

      session.on("event", (ev) => {
        if (ev.type === "text_delta") sink.sendChunk({ kind: "text_delta", text: ev.text });
        if (ev.type === "done")       sink.sendDone(ev.totalTokens);
        if (ev.type === "error")      sink.sendError(IpcErrorCodes.ACP_ERROR, ev.message);
      });

      return {
        start: () => session.start(prompt),
        cancel: () => session.cancel(),
      };
    },
  });
});
```

Kit 负责：

- `MessageChannelMain` 创建 + `port2` 传给 renderer
- 等待 renderer `{ type: "ready" }` 握手
- `sink.sendChunk/sendDone/sendError` 的关闭守卫（第二次调用是 no-op）
- port 关闭时自动调 `cancel()`
- `onReady` / `start()` 抛错归一化成 `sendError(code, message)`

**不得** 在 handler 内手写 `new MessageChannelMain`、`portClosed` flag、port message listener。

### `errors.ts`

构造带错误码的 Error：

```ts
import { ipcError } from "./_kit/errors";
import { IpcErrorCodes } from "@shared/constants/error-codes";

throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${id}`);
```

`IpcErrorCodes` 是 `shared/constants/error-codes.ts` 导出的联合类型。
**新增错误码** 必须通过 OpenSpec change 提交，编辑 `error-codes.ts` 的同一处。
handler 返回的 `error.code` 类型被收紧为 `IpcErrorCode`，无法返回字面量字符串。

非 IPC 层（如 infra、services）需要抛错时，直接从 `@shared/errors/ipc-error` 引入 `ipcError`。

### `schema.ts`

每个 handler 的入参都要走 zod 校验：

```ts
const form = validate(streamMessageInputSchema, input);
```

schema 文件位于 `shared/schemas/ipc/<domain>.ts`，按业务域组织。校验失败 `wrapHandler` 会返回 `VALIDATION_ERROR`，handler 不用额外写 try/catch。

## 会话与进程治理

### SessionRegistry

`services/chat/session-registry.ts` 是所有活跃 `AcpSession` 的唯一入口。三个 owner 命名空间：

| Owner     | key 示例                   | 使用者                  |
| --------- | -------------------------- | ----------------------- |
| `chat`    | `sessionId`                | `ipc/chat.ts`           |
| `apply`   | `runId`                    | `ipc/proposal-apply.ts` |
| `archive` | `${projectId}:${changeId}` | `ipc/proposal-apply.ts` |

```ts
sessionRegistry.register("chat", sessionId, session);
sessionRegistry.cancel("chat", sessionId); // 取消并移除
sessionRegistry.cancelByOwner("apply"); // 批量取消某 owner
sessionRegistry.unregister("chat", sessionId); // 仅移除（不 cancel，用于 done/error 后的清理）
```

SessionRegistry 自己注册为 disposable，`app.on("before-quit")` 时会 `cancelAll()`。

**禁止** 在其他模块创建 `new Map<string, AcpSession>`。

### ACP 进程池

`infra/process/acp-process-pool.ts`：

- `stderr` 按行转发到 `logger.warn`（不再 inherit，prod 下也能看到诊断输出）。
- 退出后按 backoff 序列重启：`[0, 500, 2000, 5000]` ms。
- 超过序列长度仍继续退出的 agent 进入 `giveUp` 状态：
  - 广播 `AcpAgentChannels.agentUnavailable` 事件给 renderer
  - 下次 `getOrStartProcess(agentId)` 抛出 `ACP_EXIT_GIVEUP`
- 成功使用（handler 成功拿到 process）后 `failures` 归零。
- 注册为 disposable：退出时 kill 所有 child 并等其 `close`，超时 2s。

### Disposable 生命周期

任何长期存活的资源（子进程、定时器、文件监听、registry refresh promise）**必须** 通过 `registerDisposable` 登记：

```ts
import { registerDisposable } from "@main/bootstrap/lifecycle";

registerDisposable({
  name: "my-resource",
  dispose: async () => {
    // 释放资源
  },
});
```

`app.on("before-quit")` 会 `preventDefault()`、调 `disposeAll()`（逆序 + 5s 超时），然后 `app.exit(0)`。

## 路径 / ID / 默认值单点化

| 需求                   | 使用                                   | 位置                                |
| ---------------------- | -------------------------------------- | ----------------------------------- |
| 项目根目录             | `projectDir(projectPath)`              | `@main/infra/storage/project-paths` |
| 会话目录               | `sessionsDir(projectPath)`             | 同上                                |
| Apply run 目录         | `applyRunsDir(projectPath)`            | 同上                                |
| 工作流目录             | `workflowsDir(projectPath)`            | 同上                                |
| 应用随附资源根目录     | `getResourcesPath()`                   | `@main/infra/paths`                 |
| 新建 session id        | `newSessionId()`                       | `@main/infra/ids`                   |
| 新建 apply run id      | `newRunId()`                           | 同上                                |
| Stage 级 Fyllo 会话 id | `newStageFylloSessionId(runId, index)` | 同上                                |
| 默认 ACP agent         | `DEFAULT_ACP_AGENT_ID`                 | `@shared/constants/agents`          |

**禁止** 在 service / ipc 层直接 `join + encodeProjectPath`、`` `session-${Date.now()}` ``、硬编码 `"claude-acp"`。

随应用分发的根目录 `resources/` 必须通过 `@main/infra/paths` 的 `getResourcesPath()` 获取。业务模块只在资源根目录下拼接自己的子路径（例如 workflow 使用 `workflows/built-in`），不得直接依赖 `process.resourcesPath`、`app.getAppPath()`、`app.asar.unpacked` 等打包布局细节。

## 日志

```ts
import logger from "@main/infra/logger";

logger.info("...");
logger.warn("...");
logger.error("...");
```

- 渲染进程使用 `import log from "electron-log/renderer"`，preload 已经装好了转发通道。
- 未来 tag 工厂 `createLogger("domain.sub")` 将替代手写 `[xxx]` 前缀（tracked in tasks.md §4.13，跨领域逐步迁移）。

## 新增一个 IPC 方法的完整流程

假设要新增 `window.api.foo.bar({ id: string })` 返回一个对象。

1. **channel 常量**：`shared/types/channels.ts` 的对应 `FooChannels` 加 `bar: "foo:bar"`。
2. **zod schema**：`shared/schemas/ipc/foo.ts` 加 `barInputSchema = z.object({ id: z.string().min(1) })`。
3. **（可选）新错误码**：`shared/constants/error-codes.ts` 新增 `IpcErrorCodes.FOO_NOT_FOUND`（需 OpenSpec change）。
4. **service 方法**：`electron/main/services/foo/foo-service.ts` 写业务逻辑，抛 `ipcError(...)`，调用 infra/domain。
5. **handler**：`electron/main/ipc/foo.ts` 加：
   ```ts
   ipcMain.handle(FooChannels.bar, (_event, input: unknown) =>
     wrapHandler(async () => {
       const { id } = validate(barInputSchema, input);
       return bar(id);
     })
   );
   ```
6. **preload API**：`electron/preload/api/foo.ts` 暴露 `bar`；更新 `preload/index.d.ts`。
7. **单测**：service、domain、infra 以及 `ipc/_kit` 的纯函数补单元测试，测试文件统一放在 `electron/main/__tests__/`，按源码目录镜像组织。
8. **spec**：若改变用户可见行为，先走 OpenSpec change。

## 新增一个持久化资源

1. `shared/types/` 定义持久化的 meta 结构（如果跨进程共享）。
2. `infra/storage/project-paths.ts` 添加目录函数 `xxxDir(projectPath)`。
3. `infra/storage/xxx-store.ts` 实现 CRUD（只负责序列化 + 文件 IO）。
4. `services/<domain>/xxx-service.ts` 实现业务规则（校验、默认值、跨资源协调）。
5. handler 只做 validate + 调 service。

## 违规排查

| 报错                                                      | 原因 / 修复                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `domain/ must not depend on infra/`                       | domain 出现了 fs/path/electron 调用，把 IO 搬到 infra 或 service      |
| `ipc/ handlers must go through services/`                 | handler 直接 import 了 infra/domain，把逻辑下沉到 service             |
| `ipc/ must not touch fs directly`                         | 同上                                                                  |
| `infra/ must not depend on services/`                     | infra 不应依赖 services；如果是读 registry 等数据，搬到 infra/storage |
| `'TOTALLY_FAKE' is not assignable to type 'IpcErrorCode'` | 使用了未声明的错误码，在 `shared/constants/error-codes.ts` 登记       |
