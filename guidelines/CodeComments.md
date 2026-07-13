---
name: Code Comments
description: 规范源码中注释的使用场景、粒度与格式，避免冗余注释，只在降低理解成本的必要位置添加注释。
keywords: [comments, documentation, readability, code-style]
---

# Code Comments

## Scope

- Covered: `src/`、`test/`、`scripts/` 下的 TypeScript / Vue 源码。
- Not covered: 自动生成的类型声明、构建产物、第三方配置文件；这些文件不应手动维护注释。

## Rules

### 1. 注释是“为什么”的补充，不是“是什么”的翻译

- **MUST NOT** 为每个函数、每个变量都写注释。函数名、参数类型、返回值类型已经能表达“是什么”的，不再重复注释。
- **MUST** 在代码本身无法表达意图时添加注释，重点是解释 **为什么** 这样写、**为什么** 需要这段逻辑、**为什么** 不能简单替换。

### 2. 必须添加注释的场景

- **复杂算法或非显而易见的业务规则**
  当一段逻辑涉及多步推导、状态机、边界条件、特殊兼容处理时，用注释说明核心思路或关键约束。

- **跨函数 / 跨模块的数据流转**
  当数据需要经过多层转换、序列化、映射，或跨越 IPC / 存储 / 网络边界时，在关键节点说明数据形态变化与目的。

- **正则表达式、解析器、协议适配**
  任何 regex、tokenizer、AST 转换、协议字段映射都必须注释其匹配策略、字段含义或协议版本约束。

- **架构层决策与折衷**
  当一个文件存在的主要原因是分层 / 解耦 / 避免循环依赖（例如仅做 re-export），用注释说明其存在的理由。

- **具有副作用或前置条件的导出函数**
  当导出函数会修改外部状态、依赖特定初始化顺序、或调用方需要满足特殊前置条件时，使用 JSDoc 说明。

### 3. 不建议添加注释的场景

- 函数名和类型签名已自解释的纯工具函数。
- 模板中只是罗列子组件、普通条件渲染的 Vue 文件。
- 简单的 getter / setter、纯类型转换、一行就能看懂的赋值。

### 4. 测试代码的注释

`test/` 已在 scope 内，但测试代码的注释重点与生产代码略有不同：

- **MUST NOT** 用注释重复 `describe` / `it` 已经说明的测试意图。测试名本身就是首要文档。
- **SHOULD** 在以下位置添加注释：
  - 非显而易见的测试 helper、fixture、mock 替身（例如用 EventEmitter 模拟 session）。
  - 某个回归测试或边界用例存在的业务原因。
  - 复杂的测试前置条件或环境 workaround。
  - 对断言结果的解释，当断言表达式本身不能一眼看出其含义时。

### 5. 注释风格

- **MUST** 使用中文编写注释，与项目既有约定保持一致。
- **SHOULD** 使用单行注释 `//` 说明局部逻辑。
- **SHOULD** 使用 JSDoc `/** */` 说明导出函数、模块或公共接口的契约。
- **MUST NOT** 使用注释禁用 lint 规则作为长期方案；临时禁用必须在注释中说明原因与清理计划。
- **MUST** 在修改代码时同步更新相关注释；过时的注释比没有注释更危险。

## Examples

- ✅ `src/main/services/session/chat/message-assembler.ts:1` — 用简短注释说明该文件只是 `domain/` 的 re-export，避免 IPC handler 直接引用 domain 层。
- ✅ `src/main/infra/storage/project-paths.ts:12` — 对 `encodeProjectPath` 使用 JSDoc，说明其用途与输出路径约定。
- ✅ `test/main/services/session/chat/acp-stream-driver.spec.ts:14` — 对 `createFakeSession` helper 使用 JSDoc，说明其是用 EventEmitter 模拟的 AcpSession 替身。
- ❌ `src/shared/utils/fyllo-action.ts:32` — 正则 `fylloActionTagPattern` 未说明匹配策略与边界处理，应补充注释。

## Verification

- 代码审查时检查：新增注释是否解释“为什么”，而非重复代码。
- 修改代码后检查：相关注释是否仍然准确。
