## Context

FylloCode 的 guidelines 演进目前完全依赖用户显式发起，agent 在 chat/apply/archive 阶段不会主动评估是否需要更新 guidelines。

现有机制：

- `openspec/config.yaml` 支持 `rules.<artifactId>` 注入自定义规则，这些规则在生成对应 artifact 时注入到 agent prompt
- `apply.txt` 和 `archive.txt` 已有 `mcp__fyllo_skills__guidelines` 的轻量路由，但措辞是建议性的（"check whether..."）
- `system-reminder-injection` spec 明确要求 apply/archive reminder 路由 agent 到 guidelines skill，但未要求强制更新

本次变更不引入新文件、新 IPC、新类型，只修改配置和模板文本。

## Goals / Non-Goals

**Goals:**

- `openspec/config.yaml` 新增 `rules.tasks`，引导 agent 在生成 tasks.md 时评估 guidelines 影响
- `apply.txt` 加强 guidelines 演进措辞：从"检查是否需要"升级为"若发现缺失/过时/不符，作为本次 change 的一部分更新"
- `archive.txt` 加强 guidelines 归档前检查措辞：明确列出触发条件（命令、架构、测试、流程、数据契约、项目约定）

**Non-Goals:**

- 不引入 `guidelines-delta.md` 等新 artifact 类型
- 不修改 `chat.txt`（chat 阶段已有 guidelines 路由，且本次聚焦 apply/archive）
- 不修改任何 TypeScript 代码

## Decisions

**决策 1：用 config.yaml rules.tasks 而非自定义 schema**

- 理由：自定义 schema 需要分发到每个用户项目，维护成本高；`rules.tasks` 是 OpenSpec 原生支持的轻量扩展点，直接写入 FylloCode 自身的 `openspec/config.yaml` 即可生效
- 备选方案：fork spec-driven schema 加 guidelines-delta artifact → 被否决（分发问题）

**决策 2：加强措辞而非新增约束**

- apply.txt 第 39 行已有："If implementation reveals local guidelines are missing, stale, or inconsistent with repository facts, update the relevant guidelines as part of the same change."
- 本次只需确认这条措辞足够强，不需要重写整段
- archive.txt 的 guidelines 检查段落需要补充具体触发条件列表，使 agent 有明确的检查清单

**决策 3：tasks rules 注入的粒度**

- 注入一条规则："评估本次 change 是否需要新增或修改 guidelines 文件（guidelines/\*.md）。若有，在 tasks 中加入对应 task，明确指出要修改哪个文件、修改什么内容。"
- 不要求每次都必须有 guidelines task，只要求 agent 主动评估

## Risks / Trade-offs

- **[风险] rules.tasks 注入的规则被 agent 敷衍执行**（写"无需更新"就跳过）→ 可接受：这是 prompt 层的固有局限，比完全没有引导要好；archive 阶段的检查是第二道保障
- **[风险] apply.txt 措辞已经足够强，本次修改是冗余的** → 读完 apply.txt 后确认：第 39 行的措辞已经是强制要求，apply.txt 无需修改；archive.txt 的 guidelines 段落需要补充触发条件列表
