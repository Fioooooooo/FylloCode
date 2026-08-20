## 1. Renderer canonical kind

- [x] 1.1 在 src/renderer/src/utils/chatTool.ts 扩展 ToolKind、TOOL_KINDS 和 TOOL_KIND_ICONS，加入 delete、move、think、fetch、switch_mode，保留 write 与 other，并让 getToolKind 对空值和未知字符串继续回退为 other。
- [x] 1.2 在 src/renderer/src/utils/chatAssistant.ts 扩展 ACTIVITY_KIND_LABELS，为新增 kind 提供稳定动词/名词；确保 tool think 与 reasoning 共用 Think 类别，但仍按各自 part 类型处理图标和详情。
- [x] 1.3 按 guidelines/IconConventions.md 和 guidelines/UiDesign.md 检查新增 Lucide 图标的语义、浅色/深色主题可见性以及直接工具和 Activity group 的共同消费者；不新增 Agent ID 或 adapter 分支。

## 2. Mapper 与 Renderer 测试

- [x] 2.1 在 test/main/services/session/chat/acp-mapper/tool-call-mapper.spec.ts 增加表格化测试，证明 delete、move、think、fetch、switch_mode 从 ACP 公共 kind 进入共享事件时保持原始字符串，且 mapper 不需要 Agent-specific adapter。
- [x] 2.2 在 test/renderer/src/utils/chat-tool.test.ts 覆盖每个新增 kind 的识别与图标映射，并覆盖 legacy write、空值和未知值回退到 other。
- [x] 2.3 在 test/renderer/src/utils/chat-assistant.test.ts 覆盖新增 kind 的 Activity 摘要、复数、首次出现顺序、代表图标，以及 reasoning 与 tool think 合并为 Think 类别。

## 3. 集成验证

- [x] 3.1 回放现有 Kimi fixture 中的 fetch 事件，确认其保持 fetch 语义；测试不得引入 Kimi adapter、Agent ID 特判或子 Agent 关系。
- [x] 3.2 运行相关 Main/Renderer focused Vitest、pnpm typecheck:node、pnpm typecheck:web 和 touched-file lint；确认历史 write、未知 kind、普通工具详情、Activity group 与共享字段没有回归。
