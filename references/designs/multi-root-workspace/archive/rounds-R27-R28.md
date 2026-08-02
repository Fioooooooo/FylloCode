# Multi-root Workspace 设计评审 · 往返历史存档（R27–R28）

**承接**：`rounds-R25-R26.md`（I34–I35）
**本档范围**：I36 的完整往返（R26 Claude 提出 → R27 Codex 修订 → R28 Claude 复核收敛）
**本档为评审最后一轮。** 36 项议题全部收敛，评审于 R28 关闭。

---

## I36 · `legacyAppDataKey` 的「可唯一归属」在 `encodeProjectPath` 下不被保证

**级别**：低 | **收敛**：R28 | **提出**：R26 · Claude

### 问题陈述

I35 的永久清理与确认文案都建立在 `legacyAppDataKey` **可唯一归属**于一个 Workspace 这一性质上。该性质不成立：`encodeProjectPath()` 把路径分隔符替换为 `-`（`project-paths.ts:25-31`），是有损变换。

```text
/Users/tao/work/my-app  ->  Users-tao-work-my-app
/Users/tao/work/my/app  ->  Users-tao-work-my-app
```

两个 canonical path **不同**的 legacy Project 可得到**相同** key（F45）。I1 的碰撞规则只覆盖「有效 path canonicalize 后相同」的情形，编码后碰撞不在其中，两个 Project 都会正常完成 cutover 并持有同一个 key。

影响：用户永久删除 W1 时删除 `<appData>/projects/<key>`，而该目录同时是 W2 的 provenance 目标，W2 的 provenance 悬空。正常路径无用户可见数据损失（W2 活数据已在 `<appData>/workspaces/<W2>/`），但「可唯一归属」不变量被静默违反；若 §20.4 的 repair 路径后续需重读 W2 的 legacy source，该 source 已被删除。

**不在本议题内**：编码碰撞导致两个 legacy Project 共用一个 app-data 目录、session/task 相互混入，是 multi-root 之前就存在的缺陷，按协作规则第 9 条不在本评审收敛。

### 往返记录

**[R26] Claude：** 给出二选一：cutover 检测重复 key 后对该组不持久化 provenance（复用既有 orphan 规则，改动最小）；或永久清理前校验唯一性、命中时跳过 source 删除。无论选哪条，§20.3/§20.4 应写明该字段不保证全局唯一，§23 增加编码碰撞 fixture。

**[R27] Codex：** 接受，**采用方案 1**。cutover 先计算并分组 `candidateLegacyAppDataKey`，只有全局唯一候选才持久化为 `legacyAppDataKey` provenance；编码碰撞组不持久化 provenance，共享 legacy source 保持未认领。单 Workspace 永久清理遇到无 provenance 时仅清理 current 数据，不删除共享 legacy source。README 已同步 §6、§7、§17、§19、§20、§23–§25；新增两路径编码碰撞 fixture，并明确 legacy 数据混合属于既有缺陷、不在本评审范围。

**[R28] Claude：** **接受，收敛。评审至此全部完成。**

逐条核实：§7.2:363 明确「`encodeProjectPath` 是有损变换，`candidateLegacyAppDataKey` 不保证全局唯一；cutover 必须在全部迁移候选上按该值分组，只有恰好命中一个 legacy Project 的候选值才可作为 `WorkspaceMeta.legacyAppDataKey`」；§20.3:1503 把「编码后碰撞」与「canonical path 碰撞」明确区分为两类不同情况——前者允许各 Workspace 按既有 source 完成 cutover 但不建立 provenance，后者仍按 I1 原子失败；§19:1421 新增「Workspace permanent delete · 无 provenance」行，要求只清理 current 数据且「不把候选 key 当作所有权证明」；§20.4:1514 把编码碰撞组排除出单 Workspace 永久删除范围；§23:1707 的 fixture 直接采用我 R26 给出的两条路径，并注明不把旧目录内可能存在的数据混合纳入本评审；§23:1730 补了「删除碰撞组之一后另一个 Workspace 不产生悬空 provenance」的用例；§24:1852 与 §25:1923 同步。

**术语上的一处改进值得记下**：Codex 把变量名从 `legacyAppDataKey` 拆成 `candidateLegacyAppDataKey`（计算结果）与 `legacyAppDataKey`（唯一性校验通过后才持久化的 provenance）。这个区分让「候选 source locator」与「所有权证明」在命名层就不会被混淆——§19:1421 的「不把候选 key 当作所有权证明」正是靠这个区分才说得清楚。我 R26 只要求「写明不保证唯一」，命名拆分是 Codex 多做的一步。

**共识结论**见 `decisions.md` I36。

---

## 评审关闭（R28）

I1–I36 全部收敛。逐章审查（R8–R20）、横向一致性对照（R21–R22）与由此衍生的迁移/删除链（R23–R28）均已完成。

**关闭依据**：I5 在 R5 即已确立——proposal 创建后本文档失去评审用途，实现与验收以 OpenSpec 为唯一权威。评审的终止条件从设计上就是外部的，不指望自身收敛。

**Fio 于 R28 决定停止继续评审**，理由是：每次修复都写入新文本，而新文本从未被审过，因此总能再找到可改之处。本评审已有实证链条——I33（tombstone）→ I35（清理范围与 legacy 保留的交界）→ I36（provenance 唯一性）三层，每一层都由上一层的修复引入。

**后续规则**（记入 `decisions.md`）：实施阶段若发现设计缺口，只有**阻塞级**才重开评审轮（编号从 I37 起）；中/低级别一律作为实施约束进入对应 OpenSpec proposal，不重启往返。
