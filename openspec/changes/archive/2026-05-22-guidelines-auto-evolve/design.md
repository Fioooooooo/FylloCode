## Context

FylloCode 的 guidelines 演进目前完全依赖用户显式发起，agent 在 chat/apply/archive 阶段不会主动评估是否需要更新 guidelines。

更关键的是：FylloCode 通过 `runtime-openspec#createChange` 为用户项目首次创建 `openspec/config.yaml`（参见 `mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts` 的 `DEFAULT_CONFIG_YAML` 与 `ensureOpenSpecProjectInitialized`）。这个默认模板目前仅在注释里展示 `rules.tasks` 用法，并未真正注入任何规则；现行 spec（`fyllo-specs-mcp` capability）还要求"已存在的 config.yaml 一字不动"。

现有相邻机制已就位、本次不需重做：

- `apply.txt:39` 已要求 agent 在 apply 中发现 guidelines 缺失或过时即更新
- `archive.txt:30` 已列出全部六个触发条件
- `system-reminder-injection` spec 已规范了上述 apply/archive 行为

唯一缺口在 chat → tasks 生成阶段：tasks.md 没有任何引导让 agent 评估 guidelines 影响，而且这个引导应该作为 FylloCode 注入到所有 OpenSpec 项目的默认值，而不是只对 FylloCode 自身生效。

## Goals / Non-Goals

**Goals:**

- FylloCode 自身 `openspec/config.yaml` 注入 `rules.tasks`（中文）
- `runtime-openspec` 默认模板 `DEFAULT_CONFIG_YAML` 升级为带英文 `rules.tasks` 的真实配置，而不仅是注释示例
- `ensureOpenSpecProjectInitialized` 在 config.yaml 已存在但缺失该英文规则时补齐，保留其他字段
- 用 `__tests__/openspec-runtime.test.ts` 锁定三种 config 状态行为

**Non-Goals:**

- 不引入 `guidelines-delta.md` 等新 artifact 类型
- 不修改 `chat.txt` / `apply.txt` / `archive.txt`
- 不修改其他 TypeScript 业务代码
- 不为 FylloCode 自身的 `openspec/config.yaml` 写英文规则（FylloCode 项目语言为中文，与本仓库 `context` 一致）

## Decisions

**决策 1：用 config.yaml `rules.tasks` 而非自定义 schema**

- 自定义 schema 需要分发到每个用户项目，维护成本高；`rules.tasks` 是 OpenSpec 原生支持的轻量扩展点
- 备选方案：fork spec-driven schema 加 guidelines-delta artifact → 被否决（分发问题）

**决策 2：不修改 apply.txt / archive.txt**

- apply.txt 第 39 行已经是强制要求；archive.txt 第 30 行已经列出全部六个触发条件
- 真正的缺口在 tasks 生成阶段，本次只补这一处

**决策 3：MCP 默认规则用英文，FylloCode 自身用中文**

- FylloCode 自身 `openspec/config.yaml` 已有 `context: |` 声明语言为简体中文，自身规则使用中文
- MCP 默认模板会被分发到所有用户项目，目标用户 / 目标 agent 语言不可控；英文是最稳的默认值
- 用户拿到默认模板后可以自由翻译或扩充，FylloCode 不强行替换

**决策 4：放宽"已有 config.yaml 一字不动"**

- 现行 spec：`existing OpenSpec config is preserved` 要求 `SHALL NOT 覆盖或改写`
- 本次需要在缺失默认 `rules.tasks` 时补齐 → 必须 MODIFY 该 SHALL
- 兼容策略：检测 `GUIDELINES_TASKS_RULE_EN` 字面量是否已存在，存在则保持字节不变；不存在才解析-合并-回写。这能最大限度保留用户已手工编辑过的格式、注释与字段顺序
- 副作用：用户若手工把规则文本翻译成本地化语言，会被识别为"缺失"而再次注入英文规则。可接受 — 这是保持检测简单（字面量）的代价；更复杂的语义检测会引入新的失败模式

**决策 5：rule 文本与检测使用同一字符串常量**

- 在 `create-change.ts` 顶部定义 `GUIDELINES_TASKS_RULE_EN`，`DEFAULT_CONFIG_YAML` 与 `ensureOpenSpecProjectInitialized` 都引用它
- 防止两处文本漂移（任何措辞修改后，旧文件被识别为"缺失"、被反复重写）

## Risks / Trade-offs

- **[风险] rules.tasks 注入的规则被 agent 敷衍执行**（写"无需更新"就跳过）→ 可接受：apply 阶段的"发现缺口即更新" 与 archive 阶段的最终检查是后续两道保障
- **[风险] 字面量检测对手工翻译/改写不友好** → 见决策 4，已显式接受
- **[风险] 规则文本未来需要演进** → 演进时需要同步：`DEFAULT_CONFIG_YAML`、`GUIDELINES_TASKS_RULE_EN`、相关 spec scenario 期望、测试 fixture。这些都集中在 `create-change.ts` 与本 capability spec，影响面可控
