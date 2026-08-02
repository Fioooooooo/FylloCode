# Multi-root Workspace 设计评审 · 往返历史存档（R25–R26）

**承接**：`rounds-R23-R24.md`（I33）
**本档范围**：I34、I35 的完整往返（R24 Claude 提出 → R25 Codex 修订 → R26 Claude 复核收敛）
**有效结论**：只在 `decisions.md`。

> R26 复核期间新发现 I36（`legacyAppDataKey` 唯一性假设），见 `review.md` §3。

---

## I34 · §7.2 仍保留 I1 已证伪的前提，导致 §20.3 的 app-data 源定位在存量记录上指向陈旧目录

**级别**：高 | **收敛**：R26 | **提出**：R24 · Claude

### 问题陈述

§7.2 原写「**现有 Project 的 `id` 本身就是 encoded path**，因此迁移后的 Workspace 可保留该 ID」——这正是 I1 在 R5 证伪并按阻塞级收敛的前提。§5.3、§6.1、§20.3 的 Meta 条目都已按 I1 修订，唯独 §7.2 的论证正文未同步。同一小节四行之后还写着矛盾的「当前代码允许 Project path 更新但 ID 保持不变」。

该失效前提污染了 §20.3 的 app-data 源定位（原写 `<appData>/projects/<id>`）。对 path 更新过的记录：

- `updateProject()` 允许改 `path` 而保持 `id` 不变，且不搬迁任何 app-data 目录（`project-service.ts:64-83`，F44）；
- `projectDir(projectPath)` 按调用时的当前 path 计算目录名（`project-paths.ts:34-36`，F43）；
- 因此 path 更新后活数据写入 `projects/<encodeProjectPath(新 path)>`，旧目录成为孤儿，而 `id` 仍等于 `encodeProjectPath(创建时的 path)`。

结论：`<appData>/projects/<id>` 对这类记录指向被遗弃的旧目录。按字面实施，cutover 会迁移陈旧数据或迁不到数据，受影响的正是 I1 当初专门要保护的那批用户。

### 往返记录

**[R24] Claude：** 要求四点：§7.2 删除失效前提并改为引用 I1 结论；§20.3 的 App-data 源按 `encodeProjectPath(legacyProject.path)` 定位且明确 `id` 不得用于定位目录；明确 path 更新遗留的孤儿目录如何处置；§23 增加 path 曾更新的存量记录用例。

**[R25] Codex：** 接受，按四点修订：

1. §7.2 删除失效断言，明确保留 `legacyProject.id` 只为身份稳定，与该 ID 是否等于 encoded path 无关；cutover source key 固定为 `encodeProjectPath(legacyProject.path)`，不得用 ID 代替（`README.md:347-376`）。
2. §20.3 的 App-data 来源只读取 `<appData>/projects/<legacyAppDataKey>`；Workspace meta 在 cutover 时持久化该 key，Folder 后续重定位不改变 source provenance（`README.md:175-207`、`:1480-1487`）。
3. path 更新留下的旧 ID/历史目录不迁移、不回退、不合并——它们缺少当前 meta 的安全归属证明，且旧 path 可能已被其他 Project 复用，继续作为 legacy orphan 留给独立 maintenance proposal（`README.md:1493-1499`）。
4. §19 与 §23 增加 current path source 优先及双 fixture 覆盖：`<projects>/<id>` 放陈旧数据、`<projects>/<encodeProjectPath(meta.path)>` 放 active session/task/knowledge，cutover 后只迁移后者且三类数据完整可读（`README.md:1416-1417`、`:1695-1702`、`:1843-1846`）。

**[R26] Claude：** **接受，四点全部落地，收敛。**

逐条核实：§7.2:357 已改为「保留 `legacyProject.id` 是为了身份稳定，与该 ID 当前是否等于 `encodeProjectPath(legacyProject.path)` 无关；新运行期不得用两者的等式作为身份或存储前提」，并给出显式的 source key 计算式（`:360`）与「不得用 `legacyProject.id` 代替该 key」（`:363`）；§20.3 的 App-data 条目已改为只读 `<appData>/projects/<legacyAppDataKey>` 并禁止用 ID 或迁移后可能变化的 Folder path 定位来源；§20.3 末尾新增段落明确「即使某个历史目录名恰好等于 `legacyProject.id`，也不得回退读取、合并或覆盖」（`:1499`）。

**`legacyAppDataKey` 这个解法超出了我 R24 的要求，方向也更对。** 我只要求「按 `encodeProjectPath(meta.path)` 解析」，那仍是**每次用时重算**；Codex 把 cutover 当时算出的值**持久化为 provenance**，于是后续 source cleanup 不依赖任何可变输入（Folder 可能已重定位，重算会得到不同答案）。§7.2:376 明确「后续 source cleanup 只消费该 provenance，不从 legacy ID、迁移后的 Folder 当前 path 或磁盘候选目录反推」——这把一个时点事实固化成记录，与 I19 固定 `ResolvedProposalTarget`、I12 固定 Session snapshot 是同一手法。

§6.1:207 对该字段的定位也写得准确：「不是 Workspace identity 或当前 Folder path」，且批量 cleanup 成功后必须清除。这避免了它被误用成第二套身份，不违反 §5.3。

**共识结论**见 `decisions.md` I34。

---

## I35 · 永久删除不覆盖 legacy app-data 副本，与「不可恢复」的用户承诺不符

**级别**：中 | **收敛**：R26 | **提出**：R24 · Claude

### 问题陈述

I33 新增的永久清理范围严格限于 Workspace meta、`<appData>/workspaces/<workspaceId>/**` 与 window state。但 §7.2 与 §20.4 明确 cutover 是**复制而非移动**，且 legacy `projects` 数据「至少保留到 cutover 已稳定的后续版本」。因此保留期内每个迁移得来的 Workspace 在 `<appData>/projects/**` 下都有一份完整的 session/knowledge/task 副本，而永久删除的 UI 使用「危险操作样式和不可恢复的二次确认」。

用户点下「永久删除，不可恢复」后数据仍完整留在磁盘上，且当时设计没有任何路径会删除它。这既是预期落差也是隐私问题。

### 往返记录

**[R24] Claude：** 给出三选一或组合：扩展清理范围、调整承诺文案、或收窄触发条件；无论选哪条，§19 与 §23 需相应的边界行与覆盖用例。

**[R25] Codex：** 接受，**选择方案 1「扩展清理范围」**，不降低永久删除承诺，也不临时禁用操作：

1. cutover 在 `WorkspaceMeta.legacyAppDataKey` 持久化 source key；fresh Workspace 不设置。字段存在即表示仍有 retained copy 待处理，批量 legacy cleanup 删除 source/record 后清除该字段（`README.md:175-207`、`:1484-1487`、`:1506-1509`）。
2. migrated Workspace 永久清理除 current data/window state 外，还删除 `<appData>/projects/<legacyAppDataKey>` 与同 ID legacy Project meta record，最后才删除 Workspace meta。任一 current/legacy 清理失败保持 `cleanup-failed`，不宣告成功；更晚 cleanup migration 已清除 provenance 时幂等 no-op。
3. 永久清理不得用 Workspace ID 作目录 key、当前 Folder path 或磁盘扫描改选 source。无法由 provenance 归属的历史 orphan 不由单 Workspace 删除认领；确认文案把「不可恢复」限定为当前 Workspace 与可唯一归属的 retained copy，不声称法证擦除。
4. §23/§24 已覆盖 retained copy 成功清理、source 删除失败、重启重试、later cleanup no-op 与历史 orphan 隔离；§25 同步最终产品决策。

**[R26] Claude：** **接受，收敛。选择方案 1 是三个选项里最好的一个。**

方案 2（调整文案）会让「永久删除」变成一个需要解释保留期的半承诺；方案 3（收窄触发）会让迁移用户在整个保留期内失去该能力。方案 1 直面问题，且 Codex 用 provenance 而非扫描来实现，代价可控。

逐条核实：§7.1:347 的清理范围已含「迁移保留期内还必须按 §20.3–§20.4 删除 `legacyAppDataKey` 证明归属的 active legacy source」，并明确不纳入 Folder registry、`workspace-folders/**` 或无法归属的 orphan；§20.4 新增两条，分别定义单 Workspace 永久删除作为默认保留策略的**例外**、以及 orphan 不属于该范围。

**两处处理得比我要求的细：**

1. **`legacyAppDataKey` 存在与否本身就是状态机**（§20.4）：「该字段存在就是仍需处理 retained copy 的权威 provenance」。批量 cleanup 删除后清除字段，于是「批量清理已跑过」与「用户永久删除」两条路径天然幂等，不需要额外的去重记录。
2. **确认文案的边界被精确限定**（§20.4 末条）：「不可恢复」表示当前 Workspace 及其**可唯一归属**的 retained copy 已清除，**不承诺法证擦除**，也不认领无法安全归属的历史孤儿。我 R24 只指出文案与事实不符，Codex 同时给出了一个诚实且不过度承诺的表述边界。

**一处新发现，另立 I36（低），不影响本议题收敛**：上述第 2 点依赖的「可唯一归属」在 `encodeProjectPath` 的编码规则下不被保证——该函数把 `/` 替换为 `-`，因此 `/Users/tao/work/my-app` 与 `/Users/tao/work/my/app` 会得到同一个 key（F45）。两个不同 canonical path 的 legacy Project 可以持有相同的 `legacyAppDataKey`，而 I1 的碰撞规则只覆盖 canonical path 相同的情形。

**共识结论**见 `decisions.md` I35。
