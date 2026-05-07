# AGENTS.md

此文件作为 Coding Agent 工作时的必要指导文件，在当前项目中必须按照规定的指令工作。

## 项目概述

**FylloCode** — 基于 Electron + Vue 3 + TypeScript 的桌面应用。使用 electron-vite 构建，@nuxt/ui v4 作为 UI 组件库，vue-router/auto 实现文件系统路由。

## 技术栈

| 层       | 技术                                 |
| -------- | ------------------------------------ |
| 桌面框架 | Electron 39                          |
| 前端框架 | Vue 3.5 (Composition API)            |
| 构建工具 | Vite 7 + electron-vite 5             |
| UI 库    | @nuxt/ui 4.6                         |
| 路由     | vue-router/auto (文件系统路由)       |
| 样式     | Tailwind CSS 4                       |
| 语言     | TypeScript 6                         |
| 包管理   | pnpm                                 |
| 测试     | Vitest + @vue/test-utils + happy-dom |

## 目录结构

```
FylloCode/
├── electron/           # Electron 进程代码
│   ├── main/           # 主进程，处理 窗口创建、生命周期、IPC 监听
│   └── preload/        # 预加载脚本，包含 contextBridge 暴露 API、接口类型声明
├── frontend/           # 前端，vite + vue3
├── build/              # 构建资源（图标、entitlements）
├── resources/          # 应用资源
├── vitest.config.mts   # Vitest 配置（ESM，.mts 后缀）
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.web.json   # 前端 tsconfig（extends @electron-toolkit/tsconfig）
└── tsconfig.node.json  # 后端 tsconfig（extends @electron-toolkit/tsconfig）
```

## 常用命令

```bash
pnpm dev              # 启动开发服务器
pnpm build            # 类型检查 + 完整构建
pnpm typecheck        # 类型检查（Node + Web）
pnpm lint             # ESLint 检查
pnpm format           # Prettier 格式化
pnpm test             # 运行所有测试（单次）
pnpm test:watch       # 测试监听模式
pnpm test:coverage    # 生成覆盖率报告
```

## 文档归类

如需更多详细信息，Agent 可以主动查看下方的各类详细文档。

- **架构文档** - [Architecture](./docs/Architecture.md)
- **主进程分层** - [MainProcess](./docs/MainProcess.md)
- **数据模型** - [DataModel](./docs/DataModel.md)
- **IPC 通信** - [IPC](./docs/IPC.md)
- **测试规范** - [Testing](./docs/Testing.md)
- **编码规范** - [CodeStyle](./docs/CodeStyle.md)
- **OpenSpec 使用规范** - [OpenSpec](./docs/OpenSpec.md)

若 Agent 准备开展分析、设计、实现、重构、测试或其他 action，应先主动查阅与任务相关的现有文档，再决定下一步。

## 功能需求规范（OpenSpec）

`openspec/specs/` 是功能需求的权威来源，按功能模块分目录，每个目录下有一个 `spec.md`，包含 Requirements 和 Scenarios。

实现或修改某功能时，先在 `openspec/specs/` 中找到对应模块的 `spec.md` 阅读，spec 中的 SHALL 是强制要求。`changes/archive/` 是已归档的历史变更，仅供了解演进背景，不作为当前实现依据。

### 强制前置检查（每次收到实现类指令时必须执行）

在开始任何实现之前，先判断：**此次改动是否超出了"纯代码实现细节"的范围？**

凡是涉及"系统应该如何工作"的改动——包括但不限于数据结构、存储格式、IPC 契约、共享类型、跨模块职责、用户可见行为、系统级约束——都必须先加载 `fyllo-propose` skill，不得直接实施。

只有确认改动仅影响"代码如何实现"（内部逻辑、局部重构、样式微调等），才可直接推进。

### 何时使用 OpenSpec

所有 Agent 默认遵循以下简版规则，无需额外确认：

- **涉及已有功能改动时，先读 spec**：只要改动触及已有页面、交互流程、状态流转、IPC、共享类型或既有 bug，先阅读对应 `openspec/specs/<capability>/spec.md`。
- **涉及功能定义变化时，必须先加载 `fyllo-propose` skill**：新增功能；修改用户可见行为、交互语义、默认值、空态/异常态；修改数据结构、存储格式、IPC 契约、共享类型、公共接口；修改跨模块职责边界；这类改动必须先加载 `fyllo-propose` skill，并按该 skill 的流程创建 change，再进入实现。
- **涉及运行时基础设施或横切工程约束时，也必须先加载 `fyllo-propose` skill**：新增或修改 logging、error handling、配置加载、持久化路径规则、跨进程统一能力、全局安全约束等系统级行为约束时，即使不直接涉及页面、交互或 IPC 公共接口，也必须先加载 `fyllo-propose` skill，并按该 skill 的流程创建 change，再进入实现。
- **纯实现细节改动通常不用建 change**：样式微调但不改交互、局部重构但不改行为、测试补充、日志与注释修正、类型补强、内部实现替换但外部输入输出不变，这类改动通常可直接实施。
- **bug 修复按是否改变 requirement 判断**：如果只是实现偏差，按现有 spec 修复；如果修复后需要新增或修改 requirement/scenario，先建 change。
- **拿不准时先求证，再主动询问用户**：如果无法明确判断这是“实现变化”还是“功能定义变化”，先查相关 spec、代码、文档与已有 change；若证据足以说明只是实现细节，则可直接实施；若求证后仍无法形成单一合理结论，或无法排除功能定义、系统级约束或公共契约变化，应主动询问用户，而不是自行假定。

一句话判断：

> 改的是“系统应该如何工作”，就用 OpenSpec change；改的只是“代码如何实现”，通常不用建 change。

详细规则见 [OpenSpec 使用规范](./docs/OpenSpec.md)。

## AI 助手行为总纲（八荣八耻）

需时刻谨记八荣八耻，并以此作为工作中的判断基线。

1. **以溯源求证为荣，以妄揣接口为耻**
2. **以澄清确认为荣，以含糊推进为耻**
3. **以共识对齐为荣，以臆断业务为耻**
4. **以循用现有为荣，以擅造新构为耻**
5. **以验证完备为荣，以疏漏测试为耻**
6. **以恪守规约为荣，以悖逆架构为耻**
7. **以坦陈不知为荣，以伪饰通晓为耻**
8. **以审慎重构为荣，以轻率改动为耻**

## AI 助手执行准则

以下准则用于约束 AI 助手的具体行为，目标是在保证质量的前提下主动推进工作，避免无谓停顿。

1. **先读后改，先证后断**
   在制定 action 或修改代码前，应先阅读相关代码、类型、文档与 spec；能从现有实现中得到明确依据的，不得凭空假设。

2. **优先自主推进，避免过度确认**
   对普通实现细节、局部重构、已有模式复用、低风险命名与结构调整，应基于现有上下文直接推进，不必事事确认。

3. **仅在高风险分歧时请求确认**
   只有出现以下情况时，才应向用户确认：
   - 会改变用户可见行为或交互语义
   - 会影响数据结构、存储格式、IPC 契约、公共接口
   - 现有 spec、代码、文档无法支持单一合理结论
   - 改动不可逆、破坏性强，或可能影响大范围已有功能

4. **能复用则复用，非必要不新建**
   优先沿用项目现有组件、模式、工具函数、目录组织与接口约定；除非现有方案明显不适用，否则不新增抽象或重新造轮子。

5. **改动应与问题规模相称**
   能局部修复的，不做整片重构；能在当前模块解决的，不扩大影响面；避免为假想需求提前设计。

6. **验证与改动相匹配**
   所有改动都应进行与风险相称的验证：
   - 小改动至少做定向检查
   - 逻辑改动应补充或更新测试
   - 影响构建、类型、路由、状态流转的改动，应做对应验证

7. **如实说明不确定性**
   遇到证据不足、上下文缺失、无法安全验证的情况，应明确说明“不确定的点”和“已确认的点”，不得编造结论。

8. **尊重现有架构与工程约定**
   不擅自引入新依赖，不绕过类型系统，不破坏既有分层、路由、IPC、状态管理与测试约定；确需例外时，应先说明理由。

9. **默认采取可回退、可验证的实现路径**
   面对复杂任务时，优先选择局部、渐进、易验证的方案，而不是一次性大改；在保证方向正确的前提下先交付可工作的最小改动。

10. **沟通应聚焦结论、依据与下一步**
    与用户沟通时，应优先说明：当前判断、依据来源、已完成内容、待确认事项；避免用空泛措辞代替实际结论。
