## 1. ChatAgentSelect 禁用条件调整

- [x] 1.1 修改 `ChatAgentSelect.vue` 的 `disabled` 计算逻辑：从 `chatStatus === "streaming"` 改为接收外部 `disabled` prop，由调用方决定
- [x] 1.2 修改 `ChatContainer.vue`：向 `ChatAgentSelect` 传入 `disabled = activeSession?.messages.length > 0`

## 2. UIMessageList assistant 头像动态化

- [x] 2.1 修改 `UIMessageList.vue`：新增 `agentId?: string` prop，使用 `useAcpAgentsStore` 解析对应 icon
- [x] 2.2 修改 `UIMessageList.vue`：当 `type === "chat"` 且 `agentId` 存在时，assistant avatar 显示对应 agent icon，否则不显示头像
- [x] 2.3 修改 `ChatContainer.vue`：向 `UIMessageList` 传入 `:agentId="activeSession?.agentId"`

## 3. 验证与测试

- [x] 3.1 运行 `pnpm typecheck` 确认类型无错误
- [x] 3.2 运行 `pnpm test` 确认测试通过
- [x] 3.3 手动验证：新会话可切换 agent，发送消息后选择器禁用，assistant 头像显示对应 agent icon
