## 1. Runtime metadata 写回

- [x] 1.1 修改 `src/mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts` 中的 `createChange(projectRoot, name)`：在 OpenSpec CLI 创建 change 后读取 `.openspec.yaml`，构造新的 YAML 对象并写入 `created: new Date().toISOString()`，再写入 `status: "creating"`，确保 `created` 输出在 `status` 之前。
- [x] 1.2 保留 `createChange` 的现有早退语义：当 `yamlPath(projectRoot, name)` 已存在时直接返回，不覆盖已有 `.openspec.yaml` 的 `created` 或 `status`。
- [x] 1.3 保留原 YAML 中除 `created` 和 `status` 之外的顶层字段；实现继续使用现有 `js-yaml` 的 `load`/`dump`，不得改为字符串拼接。

## 2. 测试覆盖

- [x] 2.1 在 `test/mcp-servers/fyllo-specs/openspec-runtime.test.ts` 为 `createChange` 添加 fake timer 测试：当 CLI 生成的 `.openspec.yaml` 已包含 `created` 时，写回结果的 `created` 等于固定的 `new Date().toISOString()`，`status` 等于 `creating`，且 `created` 行位于 `status` 行之前。
- [x] 2.2 在 `test/mcp-servers/fyllo-specs/openspec-runtime.test.ts` 为缺失 `created` 的 YAML 写回路径添加覆盖；可通过 mock OpenSpec CLI 生成的文件或等价 fixture 证明缺失字段会被新增，且字段顺序仍为 `created` 在 `status` 前。
- [x] 2.3 在 `test/mcp-servers/fyllo-specs/openspec-runtime.test.ts` 覆盖已存在 change 的早退路径：预先写入 `.openspec.yaml` 后调用 `createChange`，断言原 `created` 和 `status` 未被覆盖。

## 3. 验证

- [x] 3.1 运行 `pnpm exec vitest run --project main test/mcp-servers/fyllo-specs/openspec-runtime.test.ts`，确认新增 runtime 测试通过。
- [x] 3.2 如修改影响类型或 lint，补充运行 `pnpm typecheck:node` 或 `pnpm lint` 并修复相关问题。
