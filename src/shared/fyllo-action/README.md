# Fyllo Action Shared Capability

本目录存放 Fyllo Action 的跨进程共享契约，供 Main、Renderer 和测试共同使用。

## 文件职责

- `protocol.ts`：FylloActionType、payload 判别联合、handler result、IPC input 类型、持久化 envelope 类型。
- `schemas.ts`：payload、持久化 record、IPC input 的 strict Zod schemas。
- `registry.ts`：编译期穷尽的 Action contract registry，包含 presentation/interaction 和 prompt 描述。
- `parser.ts`：标签 source 收集和 payload schema 验证。
- `identity.ts`：保留当前位置型 Action ID 构造和解析。
- `state.ts`：ready/failed/succeeded/cancelled 状态、终态/attention 谓词和迁移规则。
- `prompt.ts`：把 registry 中的结构化 Prompt 描述渲染为可直接注入 system-reminder 的字符串。

## 依赖规则

- 本目录只依赖 `@shared/types/knowledge`、`@shared/schemas/knowledge` 和标准库。
- 不得依赖 Electron、Vue、Main services、Renderer 组件或 Markstream。
