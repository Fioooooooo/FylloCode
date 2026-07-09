## 1. Archive Instruction

- [x] 1.1 修改 `src/mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md`，在归档确认与最终汇报之间增加 Purpose 占位检查要求；验收标准：instruction 明确要求 agent 检查本次新增 `openspec/specs/<capability>/spec.md` 的 `## Purpose` 是否为 `TBD - created by archiving change <change-name>. Update Purpose after archive.`。
- [x] 1.2 在同一 instruction 中写入 Purpose 替换规则；验收标准：instruction 要求替换文本基于 proposal、delta spec requirements 或同步后的 main spec requirements，描述 capability 职责、行为边界和主要契约来源，并禁止保留 `TBD`、`created by archiving change`、change 名称或 archive/sync 过程描述。
- [x] 1.3 更新 archive 完成汇报要求；验收标准：instruction 要求报告本次新增 main specs 的 Purpose 占位检查结果，并要求 agent 不得在本次新增 main spec 仍保留 skeleton Purpose 时声称 archive complete。
- [x] 1.4 保留既有 archive runtime 边界；验收标准：不修改 `src/mcp-servers/fyllo-specs/src/tools/archive-change.ts` 的输入 schema、返回 state、commitMessage 校验或 `finalizeArchiveWorkspace()` 调用顺序。
- [x] 1.5 补充 `src/mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md` 的 Purpose 内容质量要求；验收标准：instruction 明确要求 agent 不得删除 `## Purpose`，Purpose 不得为空，必须针对当前 spec 有实质性内容，并且至少 50 个字符。

## 2. Tests

- [x] 2.1 更新 `test/mcp-servers/fyllo-specs/tools.test.ts` 或新增等效 MCP tool instruction 测试，调用 `archiveChangeTool()` 获取包含 `<tool_instruction>` 的返回文本；验收标准：测试断言 instruction 包含 skeleton Purpose 文本、只处理本次新增 main specs、Purpose 替换规则和不得在占位残留时声称 archive complete 的要求。
- [x] 2.2 保留现有 archive 成功路径测试语义；验收标准：`archive-change successfully archives a change with confirm: true` 与 `archive-change syncs delta specs before archiving` 不需要断言 runtime 自动改写 Purpose，因为本 proposal 明确保持 runtime 行为不变。
- [x] 2.3 扩展 `test/mcp-servers/fyllo-specs/tools.test.ts` 的 instruction 断言；验收标准：测试覆盖不得删除 `## Purpose`、Purpose 非空、针对当前 spec 有实质性内容、至少 50 个字符。

## 3. Validation

- [x] 3.1 如果本 worktree 尚未准备本地环境，先运行 `sh scripts/prepare-worktree-env.sh`；随后运行 `pnpm exec vitest run --project main test/mcp-servers/fyllo-specs/tools.test.ts`。
- [x] 3.2 手动检查 `src/mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md`，确认新增文案没有删除或削弱现有 conflict、recovery、commit subject 和 archiveRawOutput 汇报要求。
