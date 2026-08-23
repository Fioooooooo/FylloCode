## 1. 共享契约与安全派生

- [x] 1.1 修改`src/shared/types/fyllo-spawn-rpc.ts#promptToAgentParamsSchema`：增加optional `folderId`，为`folderId`和`sessionId`补充完整Agent-facing `.describe()`，并定义可被Main存储和inspection schema复用的`SpawnedSessionScope` discriminated schema；保持RPC envelope version与既有result union不变，在`test/mcp-servers/fyllo-spawn/tools.spec.ts`断言生成的input schema description和默认输入兼容。
- [x] 1.2 新增`src/main/domain/session/spawn/spawned-session-workspace.ts`及镜像测试，提供按父`SessionWorkspaceSnapshot`和`folderId`派生单Folder effective snapshot、验证持久化workspace/folder scope仍属于父snapshot、格式化不含path的`folderId (folderName)`选择列表的纯函数；覆盖默认完整继承、选择secondary Folder、未知Folder、identity/path不一致和禁止隐式primary fallback。
- [x] 1.3 修改`src/main/infra/storage/spawned-session-store.ts`：让新写meta持久化required scope与创建时名称，同时兼容读取缺少scope的version 1 meta并归一化为workspace scope；扩展`test/main/infra/storage/spawned-session-store.spec.ts`覆盖workspace/folder往返、旧meta fallback和strict schema不泄露额外path。

## 2. prompt_to_agent新建与续聊编排

- [x] 2.1 重构`src/main/services/session/spawn/spawned-session-manager.ts#executeTurn`，在AgentProcess acquire、meta/turn/message写入和ACP prompt之前先判定新建或continuation及effective snapshot：新建省略`folderId`保持完整父snapshot，指定时只使用父snapshot内该Folder；通过`@main/services/workspace/_public#resolveWorkspace`取得workspace创建时名称，并只从父snapshot取得Folder名称。
- [x] 2.2 让continuation拒绝`folderId`并复用meta持久化的scope/effective snapshot完成compatibility gate与`runTurn()`；验证该snapshot仍是父固定snapshot允许的完整继承或单Folder子集，保持既有owner、Agent、process generation和active ACP Session校验。扩展`test/main/services/session/spawn/spawned-session-manager.spec.ts`覆盖Folder-scoped两轮续聊、默认multi-root不变、unsupported Agent在单Folderscope成功、无scope旧meta续聊及scope不可切换。
- [x] 2.3 为`folderId + sessionId`、未知`folderId`和默认multi-root `PROMPT_CAPABILITY_MISMATCH`生成结构化且可恢复的英文错误：明确没有创建Session/开始Turn，列出授权Folder ID与名称，给出下一次调用的增删字段，并说明跨Folder任务应更换支持additional directories的Agent；断言错误不含Folder path、不设可盲目重试语义且失败前不写meta/turn/message或发送prompt。
- [x] 2.4 更新`src/mcp-servers/fyllo-spawn/src/tools/prompt-to-agent.ts`的tool description，说明默认完整Workspace、首次`folderId`单根恢复、continuation scope固定，并保持异步优先、Main-owned inspection和optional Signal指导；在`test/mcp-servers/fyllo-spawn/tools.spec.ts`覆盖关键恢复文案且不复制Signal payload contract。

## 3. Inspection查询与Slideover展示

- [x] 3.1 修改`src/shared/ipc/session/spawned-session.schemas.ts#spawnedSessionSummarySchema`和`src/main/services/session/spawn/spawned-session-query-service.ts#buildSummary`，让list/detail都返回同一required精简scope（类型、opaque ID、名称），且不返回workspaceSnapshot、cwd、additionalDirectories或path；扩展`test/main/services/session/spawn/spawned-session-query-service.spec.ts`覆盖workspace、folder、旧meta fallback及running/error/expired投影。
- [x] 3.2 修改`src/renderer/src/features/spawned-session-inspector/ui/SpawnedSessionDetailSlideover.vue`，在Session header中用稳定语义icon和文字展示`Workspace · <name>`或`Folder · <name>`，不随Turn切换，loading/not_found时不猜测；按需补充`src/renderer/src/config/semantic-icons.ts`映射，并扩展`test/renderer/src/features/spawned-session-inspector/ui/spawned-session-detail-slideover.spec.ts`覆盖两类scope、terminal状态、Turn切换与可访问文本。

## 4. Bundled MCP文档与版本

- [x] 4.1 更新`src/mcp-servers/fyllo-spawn/README.md`记录`folderId`新建语义、默认完整继承、续聊限制和capability mismatch恢复示例；在`CHANGELOG.md`记录兼容新增，并按现有bundled server规则将`src/version.ts`提升一个patch版本，保持五个tools与RPC protocol version 1。

## 5. 验证

- [x] 5.1 首次运行项目命令前执行`sh scripts/prepare-worktree-env.sh`，随后运行新增/受影响的Main spawn manager/domain/storage/query、fyllo-spawn MCP tool及renderer spawned-session-inspector focused Vitest；任何失败必须区分真实断言与明确的沙箱网络限制。
- [x] 5.2 运行`pnpm typecheck`、受影响文件的Prettier check和`pnpm lint`（冷启动预留约5分钟），修复本变更引入的问题；本任务未授权且不得运行`pnpm build`。完成后更新本文件所有已验证task checkbox并在结果中列出实际命令与结果。
