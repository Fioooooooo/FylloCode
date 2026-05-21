## 1. Runtime OpenSpec 初始化能力

- [x] 1.1 在 `mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts` 内部新增或调用 helper，命名建议为 `ensureOpenSpecProjectInitialized(projectRoot: string): void`；验收标准：`createChange(projectRoot, name)` 在解析 CLI 和调用 `spawnOpenspec` 前执行该 helper。
- [x] 1.2 初始化 helper 使用 Node fs API 幂等创建 `<projectRoot>/openspec/changes/archive/` 与 `<projectRoot>/openspec/specs/`；验收标准：目录不存在时创建，已存在时不报错。
- [x] 1.3 初始化 helper 在 `<projectRoot>/openspec/config.yaml` 不存在时写入 proposal/design 中指定的完整默认 YAML 模板；验收标准：文件内容包含 `schema: spec-driven` 和项目 context / artifact rules 注释。
- [x] 1.4 初始化 helper 在 `<projectRoot>/openspec/config.yaml` 已存在时保持原文件字节内容不变；验收标准：测试中自定义 config 调用 `createChange` 后读取内容完全一致。
- [x] 1.5 若 helper 作为独立文件实现，更新 `mcp-servers/fyllo-specs/src/runtime-openspec/index.ts` 的导出时保持 tool 层公开能力不扩张；验收标准：`tools/create-proposal.ts` 仍优先只调用 `createChange(projectRoot, changeName)`。

## 2. create-proposal 集成边界

- [x] 2.1 检查 `mcp-servers/fyllo-specs/src/tools/create-proposal.ts`，确认初始化逻辑没有写入 tool 层；验收标准：tool 仍按 `prepareProposalWorkspace` → `createChange` → `computeStatus` → `getInstructions` 的顺序编排。
- [x] 2.2 确认 `runtime-workspace` 没有引入 OpenSpec 初始化职责；验收标准：`mcp-servers/fyllo-specs/src/runtime-workspace/` 下不新增 `openspec/config.yaml`、`openspec/specs`、`openspec/changes/archive` 相关写入逻辑。

## 3. 测试

- [x] 3.1 在 `mcp-servers/fyllo-specs/__tests__/openspec-runtime.test.ts` 增加 `createChange` 测试：临时目录完全缺少 `openspec/` 时，调用后生成 `openspec/config.yaml`、`openspec/changes/archive/`、`openspec/specs/` 与目标 change 目录。
- [x] 3.2 在 `mcp-servers/fyllo-specs/__tests__/openspec-runtime.test.ts` 增加 config 保留测试：预置自定义 `openspec/config.yaml` 后调用 `createChange`，断言 config 内容未被覆盖。
- [x] 3.3 在 `mcp-servers/fyllo-specs/__tests__/tools.test.ts` 调整或新增 `create-proposal` main workspace 测试：临时目录不预置 `openspec/changes` 和 `openspec/config.yaml`，调用 `createProposalTool` 后仍成功返回 workspace state 并创建 change。
- [x] 3.4 在 `mcp-servers/fyllo-specs/__tests__/tools.test.ts` 调整或新增 linked workspace 测试：git 项目缺少 OpenSpec 初始化文件时，默认 linked 模式在 `.worktrees/<changeName>` 内补齐 OpenSpec 初始化文件并创建 change。

## 4. 规范同步与验证

- [x] 4.1 根据本 change 的 delta spec 更新归档目标 `openspec/specs/fyllo-specs-mcp/spec.md`；验收标准：当前 spec 明确说明 `createChange` 在 spawn CLI 前执行最小 OpenSpec 初始化。
- [x] 4.2 运行 `pnpm test -- mcp-servers/fyllo-specs` 或项目中等价的 fyllo-specs 测试命令；验收标准：新增和既有 fyllo-specs 测试通过。
- [x] 4.3 如可用，运行 OpenSpec 针对 `initialize-openspec-before-create-proposal` 的校验；验收标准：change spec 格式通过，尤其 `MODIFIED Requirements` 中的 scenario 使用 `####` 标题。
