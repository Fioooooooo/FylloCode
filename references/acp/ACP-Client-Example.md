# ACP Client 连接 Agent 示例

本文档演示如何用 `@agentclientprotocol/sdk` 连接本地已安装的 ACP agent，以 `claude-acp` 为例。

## 安装依赖

```bash
# ACP SDK
npm install @agentclientprotocol/sdk

# 提前下载 agent 包（以 claude-acp 为例）
npm install @agentclientprotocol/claude-agent-acp
```

## 完整示例

```typescript
import { spawn } from "node:child_process";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

// ---- 1. 启动 agent 进程 ----

// npx 方式：--no-install 强制使用本地已安装包，不联网
const agentProcess = spawn("npx", ["--no-install", "@agentclientprotocol/claude-agent-acp"], {
  stdio: ["pipe", "pipe", "inherit"], // stdin/stdout 用于 ACP 消息，stderr 透传日志
  env: {
    ...process.env,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
});

// 也可以直接调用 node_modules/.bin（效果相同）
// const agentProcess = spawn(
//   "./node_modules/.bin/claude-agent-acp",
//   [],
//   { stdio: ["pipe", "pipe", "inherit"], env: process.env }
// );

// ---- 2. 建立 ACP 连接 ----

const input = Writable.toWeb(agentProcess.stdin!);
const output = Readable.toWeb(agentProcess.stdout!) as ReadableStream<Uint8Array>;

const stream = acp.ndJsonStream(input, output);

const connection = new acp.ClientSideConnection(
  (_agent) => ({
    async requestPermission(params: acp.RequestPermissionRequest) {
      // agent 请求执行 tool call 时触发（如写文件、执行命令）
      // 这里自动允许第一个选项，实际应用中应弹窗让用户确认
      console.log(`[Permission] ${params.toolCall.title}`);
      return { optionId: params.options[0].id };
    },
  }),
  stream
);

// ---- 3. 初始化握手 ----

const initResult = await connection.initialize({
  protocolVersion: acp.PROTOCOL_VERSION,
  clientCapabilities: {
    fs: {
      readTextFile: true,
      writeTextFile: true,
    },
    terminal: true,
  },
  clientInfo: {
    name: "my-client",
    version: "1.0.0",
  },
});

console.log(`Connected: protocol v${initResult.protocolVersion}`);
console.log(`Agent capabilities:`, initResult.agentCapabilities);

// ---- 4. 创建 session ----

const { sessionId } = await connection.newSession({
  cwd: process.cwd(),
  mcpServers: [],
});

console.log(`Session created: ${sessionId}`);

// ---- 5. 监听流式响应 ----

connection.on("session/update", (notification: acp.SessionUpdateNotification) => {
  if (notification.sessionId !== sessionId) return;

  if (notification.kind === "agent_message_chunk") {
    // 流式输出 agent 回复内容
    process.stdout.write(notification.content.text ?? "");
  }
});

// ---- 6. 发送 prompt ----

const result = await connection.prompt({
  sessionId,
  prompt: [
    {
      type: "text",
      text: "用一句话介绍你自己",
    },
  ],
});

console.log(`\nStop reason: ${result.stopReason}`);

// ---- 7. 关闭 session 和进程 ----

await connection.closeSession({ sessionId });
agentProcess.kill();
```

## 其他 distribution 类型

### uvx（Python 生态）

```bash
# 提前安装
uv tool install fast-agent-acp==0.6.25
```

```typescript
const agentProcess = spawn("uvx", ["fast-agent-acp", "-x"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});
```

### binary（预编译二进制）

下载解压后直接执行，无需包管理器：

```typescript
import * as path from "node:path";
import * as os from "node:os";

const installDir = path.join(os.homedir(), ".acp-agents", "codex-acp");

const agentProcess = spawn(
  path.join(installDir, "./codex-acp"),
  [], // 部分 agent 需要传 ["acp"] 等子命令，参考 registry 中的 args 字段
  {
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
  }
);
```

## 三种 distribution 类型对比

| 类型     | 启动命令                 | 提前安装方式            | 离线运行           |
| -------- | ------------------------ | ----------------------- | ------------------ |
| `npx`    | `npx --no-install <pkg>` | `npm install <pkg>`     | 需 `--no-install`  |
| `uvx`    | `uvx <pkg>`              | `uv tool install <pkg>` | 自动使用已安装版本 |
| `binary` | 直接执行二进制路径       | 手动下载解压            | 天然离线           |

## 注意事项

- agent 进程的 **stdout 只能是 ACP 消息**（NDJSON 格式），日志必须走 stderr，否则会破坏协议解析。
- `requestPermission` 回调必须实现，agent 执行 tool call（写文件、运行命令等）前会请求授权。
- `session/update` 是 notification（单向推送），不需要响应，直接监听即可。
- `closeSession` 只关闭会话，不终止进程；需要显式调用 `agentProcess.kill()` 结束进程。
