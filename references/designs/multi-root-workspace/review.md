# Multi-root Workspace 设计评审 · Claude ↔ Codex

**评审对象**：`references/designs/multi-root-workspace/README.md`
**参与方**：Claude（reviewer）、Codex（author）
**当前轮次**：R28 · **评审已关闭**（I1–I36 全部收敛）
**最后更新**：2026-08-02

> **本评审已结束，不再接受新一轮往返。** 后续以 `decisions.md` 为拆 OpenSpec proposal 的依据；实现与验收以 OpenSpec 为唯一权威（I5）。
> 实施阶段若发现设计缺口：**只有阻塞级才重开评审轮**（编号从 I37 起）；中/低级别作为实施约束进入对应 proposal，不重启往返。

---

## 文档分工（2026-07-31 拆分）

本评审已拆为三份，各自单一职责。**开始新一轮前只需读本文件 + `decisions.md`。**

| 文件                            | 内容                                            | 何时读                       |
| ------------------------------- | ----------------------------------------------- | ---------------------------- |
| **`review.md`**（本文件）       | 状态板、**未收敛议题**的完整往返、待办          | 每轮必读                     |
| **`decisions.md`**              | I1–I36 的共识结论 + 事实表 F1–F45               | **拆 proposal 时的唯一依据** |
| **`archive/rounds-R1-R17.md`**  | I1–I24 的完整辩论历史（含**已撤回的错误推导**） | 仅追溯「当时为什么这么定」时 |
| **`archive/rounds-R18-R20.md`** | I25–I28 的完整往返（含**已撤回的错误推导**）    | 仅追溯「当时为什么这么定」时 |
| **`archive/rounds-R21-R22.md`** | I29–I32 的完整往返（横向一致性对照轮）          | 仅追溯「当时为什么这么定」时 |
| **`archive/rounds-R23-R24.md`** | I33 的完整往返（tombstone 删除）                | 仅追溯「当时为什么这么定」时 |
| **`archive/rounds-R25-R26.md`** | I34–I35 的完整往返（迁移 provenance 与清理）    | 仅追溯「当时为什么这么定」时 |
| **`archive/rounds-R27-R28.md`** | I36 的完整往返 + **评审关闭说明**               | 仅追溯「当时为什么这么定」时 |

> ⚠️ archive 中包含已被证伪的论述（I9 nonce、I13 同进程、I14 攻击序列、I25 reminder 每轮注入等）。**不要从 archive 取结论**，有效结论只在 `decisions.md`。

---

## 协作规则

1. **议题（Issue）是主轴，不是轮次。** 每个未收敛议题在 §3 有独立小节，内含完整往返；读它自己的小节即可掌握现状。
2. **新增发言追加在对应议题的「往返记录」末尾**，格式 `**[R<n>] <发言方>：**`。不改对方已有发言；改变立场时新增一条并写明「撤回 / 收回 / 维持」。
3. **发现新议题**时在 §3 末尾追加新编号（当前下一个为 **I37**），并在 §2 状态板增行。编号不复用。
4. **每次发言后必须更新 §2 状态板**与文首「当前轮次」。状态板是唯一真相来源。
5. **事实性断言必须附证据**（文件路径 + 行号），未核实的推测明确标注。已核实事实汇总在 `decisions.md` 的事实表，双方不重复验证。
6. **议题收敛后**：填写「共识结论」→ 把结论同步进 `decisions.md` → 把完整往返移入 `archive/` → 本文件只留状态板一行。**由复核方（通常是 Claude）在收敛当轮执行。**
7. **允许分歧存续。** 不为收敛而单方让步；`僵持` 是合法终态，交由人类裁决。
8. **设计文档只有 Codex 可改。** Claude 是只读 reviewer，只在本文件提出、质疑、复核、反驳。
9. **范围约束**：只审 multi-root 直接改变的语义（一个 Workspace 多 Folder、Folder 跨 Workspace 共享、repository owner 显式化）。无关的既有缺陷另行记录，不在本评审收敛。

---

## 1. 当前状态

共 **36** 个议题：**全部收敛，评审关闭**。结论见 `decisions.md`，其中「实施阶段待办」一节汇总了 6 条转入 proposal 的约束。

R20 Claude 复核 I25–I28 并全部接受：I25、I26 采用「严格 activation snapshot + 注入前 stale 拒绝 + 结构化安全编码」，I27 采用可显式呈现 stale 状态的软引用，I28 补齐 route/activity bar 的统一门控。复核中 Claude **撤回** I25 的「reminder 每轮重新生成」前提（F40 证伪）及由其推出的 `unavailable` 成员形态建议。

R21 Codex 完成横向一致性对照与 §7/§25 抽查，发现 I29–I32；R22 Claude 复核并全部收敛。**横向对照轮证明了其必要性**：I29 的授权洞只有把「Folder 可跨 Workspace 共享」代入 §17.3 × §9.3 才显形，I32 是 I19 在 §7.1 的漏同步——两者逐章审查均覆盖不到。

R22 Claude 把 I31 从阻塞降为中：它不是设计缺陷，而是被正确识别的开放产品问题，按协作规则第 7 条交人类裁决。**Fio 已答复**：primary missing 维持「阻止进入 + launcher 修复」；Workspace 删除**不采纳**「不递归删除」建议值——该策略继承的可恢复性前提已被 multi-root 的身份变更废除，改为 `isDeleted` 标记方向，另立 **I33** 待 Codex 回应。

R23 Codex 接受 I33，将 Workspace 删除修订为带持久化 cleanup state 的 tombstone；R24 Claude 复核收敛。`cleanupState` 三态超出了 Claude 的要求——它额外挡住了「清理中途崩溃后被当作可恢复 tombstone 重新打开」这条路径。§19 的主语标注同时结清了 R22 在 I31 下留的遗留点。

**R24 复核期间新发现两项**：I34 —— §7.2 仍把「Project id 就是 encoded path」当作事实陈述，而这正是 I1 已证伪的前提，且它污染了 §20.3 的 app-data 源定位，对 path 更新过的存量记录会指向被遗弃的旧目录（F44）；I35 —— I33 新增的「永久删除」承诺与 §20.4 的 legacy 保留策略在交界处未定义，保留期内用户数据并未真正删除。两项都是 §7/§20 与新行为的交界，与 I32 同类。

R25 Codex 接受 I34、I35，R26 Claude 复核收敛。I34 把 legacy identity 与 app-data source key 完全拆开，并**把 cutover 当时算出的 key 持久化为 `legacyAppDataKey` provenance**——比 Claude 要求的「用时重算」更强，后续 cleanup 不依赖任何可变输入。I35 采用「扩展清理范围」，是三个选项中唯一不削弱承诺、也不禁用能力的一个；`legacyAppDataKey` 存在与否本身构成状态机，使批量清理与用户永久删除天然幂等。

**R26 复核期间新发现 I36（低）**：I35 的清理与文案都依赖 `legacyAppDataKey` **可唯一归属**，但 `encodeProjectPath` 把 `/` 替换为 `-`，是有损变换——`/a/b` 与 `/a-b` 得到同一个 key（F45），而 I1 的碰撞规则只覆盖 canonical path 相同的情形。正常路径无用户可见数据损失，但不变量被静默违反。

R27 Codex 接受 I36 并选择 cutover 检测重复 key：`encodeProjectPath` 的结果只作为 source locator 候选，只有在全部迁移 Project 中恰好命中一次时才持久化为 provenance；碰撞组不持久化 `legacyAppDataKey`，共享 source 保持未认领，单 Workspace 永久清理只删除 current 数据。R28 Claude 复核收敛。

## **评审关闭（R28）**

I1–I36 全部收敛。逐章审查（R8–R20）、横向一致性对照（R21–R22）与由此衍生的迁移/删除链（R23–R28）均已完成。

**为什么在此停止。** 关闭不是因为「再也找不到问题」——恰恰相反，本评审有一条实证链：**I33（tombstone）→ I35（清理范围与 legacy 保留的交界）→ I36（provenance 唯一性）**，三层，每层都由上一层的修复引入。每次修订都写入新文本，而新文本从未被审过，因此总能再找到可改之处。这个过程原则上没有不动点。

**终止条件从设计上就是外部的。** I5 在 R5 即已确立：proposal 创建后本文档失去评审用途，实现与验收以 OpenSpec 为唯一权威；规则第 7 条同样把最终裁量交给人类。**Fio 于 R28 决定停止。**

**支持在此停止的数据**：最近四批产出的阻塞级议题为 0（R18 起阻塞占比 2/4 → 1/4 → 0/1 → 0/2 → 0/1），且 I34–I36 全部集中在 §7/§20 迁移管道、均由审查上一处修复而发现——这是局部审透的形态，不是系统性风险仍多。

**后续规则**：实施阶段发现设计缺口时，**只有阻塞级才重开评审轮**（编号从 I37 起）；中/低级别一律作为实施约束进入对应 OpenSpec proposal，由 spec 与测试兜住，不重启往返。

---

## 2. 议题状态板

### 未收敛

**无。I1–I36 全部收敛，评审于 R28 关闭。**

### 已收敛（结论见 `decisions.md`，往返见 `archive/`）

| ID  | 议题                                                              | 级别     | 收敛轮次 |
| --- | ----------------------------------------------------------------- | -------- | -------- |
| I6  | Folder 重定位破坏 canonical path 唯一映射                         | **阻塞** | R6       |
| I1  | 存量 `id`/`path` 不一致与身份契约                                 | **阻塞** | R5       |
| I3  | 启动门控误伤 fresh install                                        | **阻塞** | R5       |
| I2  | 迁移阶段无单实例保护                                              | 高       | R5       |
| I7  | 路径查找的合法/禁止二分                                           | 中       | R5       |
| I4  | `healthScore` 迁移归属                                            | 低       | R5       |
| I5  | 第 23 章测试矩阵的权威性归属                                      | 低       | R5       |
| I8  | Folder registry mutation 并发竞态                                 | 高       | R5       |
| I9  | MCP token 无 session 绑定，multi-root 后成为跨 Workspace 越权通道 | **阻塞** | R10      |
| I10 | Repository lineage index 的 `workspaceId` 单值假设                | **阻塞** | R10      |
| I11 | `trace-file` 的 `worktreePath` 来源未定义                         | 高       | R10      |
| I12 | MCP descriptor 快照与 Folder 重定位的一致性未定义                 | 高       | R10      |
| I13 | stdio transport 无法表达 v1 授权模型                              | 中       | R10      |
| I14 | preview grant key 缺 Folder 维度，重定位后 grant 残留             | 低       | R13      |
| I15 | trusted roots 仍按单 `projectPath` 解析，未覆盖成员集合           | **阻塞** | R13      |
| I16 | resource link 与 attachment 副本的授权边界未分离                  | 高       | R13      |
| I17 | §15.2 owner projection 依赖的「禁止嵌套」前提已被 I6 收窄         | 中       | R13      |
| I18 | Apply/Archive MCP descriptor 未随 owner scope 收窄                | **阻塞** | R15      |
| I19 | ProposalRef 与实际 worktree target 的绑定不足                     | 高       | R15      |
| I20 | Explore 在 partial failure 下无法证明 owner 唯一                  | **阻塞** | R15      |
| I21 | `workspacePath/workspaceMode` 与顶层 Workspace 术语冲突           | 中       | R15      |
| I22 | Aggregate reader 无法区分合法空数据、missing 与读取失败           | 高       | R17      |
| I23 | Overview 混合 Workspace work 与 repository governance scope       | **阻塞** | R17      |
| I24 | Repository-local item identity 在跨 Folder 列表中碰撞             | 高       | R17      |
| I25 | System reminder 未定义 Folder 集合来源，与 Session snapshot 漂移  | **阻塞** | R20      |
| I26 | reminder 注入 folderPath/folderName 缺少注入防护约束              | **阻塞** | R20      |
| I27 | Task 的 `targetFolderIds` 未定义成员移除后的语义                  | 高       | R20      |
| I28 | Navigation gating 的 `requiresProject` 迁移面比 §18.2 描述更广    | 中       | R20      |
| I29 | 非 active Session 的成员移除缺少 membership revocation            | **阻塞** | R22      |
| I30 | 实时 preview 与 Agent snapshot 的差异缺少用户可见 contract        | 高       | R22      |
| I31 | §25 待确认列表与「设计已收敛」状态冲突                            | 中       | R22      |
| I32 | §7 apply/archive run 存储表遗漏固定 `worktreePath`                | 中       | R22      |
| I33 | Workspace 删除的「不递归删除 app-data」继承自已废除的前提         | 高       | R24      |
| I34 | §7.2 仍保留 I1 已证伪的前提，污染 §20.3 的 app-data 源定位        | 高       | R26      |
| I35 | 永久删除不覆盖 legacy app-data 副本，与「不可恢复」的承诺不符     | 中       | R26      |

---

## 3. 未收敛议题详情

**无。评审已于 R28 关闭。** I36 的完整往返见 `archive/rounds-R27-R28.md`，结论见 `decisions.md`。

若实施阶段发现新的设计缺口，按下述关闭规则处理：**只有阻塞级才重开评审轮（编号从 I37 起）**；中/低级别一律作为实施约束进入对应 OpenSpec proposal，不重启往返。

## 4. 已核实事实

**已移至 `decisions.md`**（F1–F45），避免两处维护。新增事实直接写入 `decisions.md` 的事实表。

## 5. 双方一致认可的设计决策

以下决策论证扎实，双方无异议，应在后续 proposal 中保留：

- **`kind` 持久化而非按 Folder 数量推导**（README §6.1）。README 第 208 行指出的「用户再次打开原文件夹时只能新建另一个 Workspace，原有 session 看似丢失」是真实的产品陷阱，五条否决理由完整。
- **能力门控按运行期 `additionalDirectories` 是否非空，而非按 Workspace kind**（README §9.1）。使单 Folder 的 Collection Workspace 与 degraded 状态仍可使用不支持该 capability 的 Agent，避免无谓的兼容性收窄。
- **v1 单 owner repository + `ProposalRef{folderId, changeId}`**（README §11）。正确识别跨仓库原子提交的复杂度并划清 v1 边界；§9.4 关于 apply/archive 不下发其他成员可写目录的理由充分。
- **MCP 只接受 `folderId`、不接受任意绝对路径**（README §10.4）。安全模型正确；R9 已进一步固定为 per-activation opaque capability，不再保留签名 claim 分支。
- **§20 对迁移框架现实的对齐**。明确否定了「幂等重试」「失败后自动回滚」等不存在的框架能力，避免基于错误前提的设计。

---

## 6. 待办清单

### 已落入 README

- [x] **I1** — 存量 `id/path` 分离、稳定 legacy ID、registry 反向解析、canonical 碰撞失败语义与测试
- [x] **I3** — required cutover 的 `success OR baseline` 门控、`failed` 不被 baseline 覆盖、fresh-install 交叉用例
- [x] **I4** — `healthScore` 字段迁移与保留测试
- [x] **I7** — 路径查找的合法/禁止二分
- [x] **I8** — Folder registry mutation 串行化边界与原子性不变量
- [x] **I5** — 第 23 章降级为临时 inventory + 退出机制（→ OpenSpec 权威 → traceability 表）
- [x] **I2** — 交付形式定为独立 `enforce-single-instance-startup` proposal，Phase 0 前置
- [x] **I6** — 部分引用 Workspace 冲突返回结构化报告、原子拒绝、UI 跳转编辑与重试路径
- [x] **I8 加固** — §17.4 的操作列举退为示例，统一不变量覆盖未来 Folder mutation
- [x] **I5 加固** — §22 提醒每个 proposal 创建时回写 §23 追踪关系

### R8–R10 新增议题（已落入 README 且经 Claude 复核）

- [x] **I9** — per-activation opaque bearer、Main-owned grant registry、移除 caller headers、proxy/backend token 分层、信任边界显式停在 Agent runtime
- [x] **I10** — lineage index v2 多值 + origin/reference 不变量、读-改-写整体串行化、迁移与覆盖
- [x] **I11** — `trace-file` 增加受校验 `worktreePath?`、逃逸拒绝、响应回传实际 target
- [x] **I12** — 严格快照 + stale 检测、active runtime 存在时以 `FOLDER_RELOCATION_ACTIVE_RUNTIME` 原子拒绝重定位
- [x] **I13** — stdio child 按 activation 独立启动不复用、与 HTTP 授权模型不等价

### R11–R13 §15 议题（已落入 README 且经 Claude 复核）

- [x] **I14** — 区分 member/worktree-derived trust 与 user-confirmed external grant；**Claude 已撤回 grant 残留推导与阻塞定性（F26）**，仅文档缺口成立
- [x] **I15** — preview context 改为 available member 集合；每次请求 live resolve、并行枚举、per-member 降级；**不缓存授权 roots**（外部 git worktree 操作无法被 I8 boundary 感知）
- [x] **I16** — attachment copy 与 resource link 分离；opaque handle、`{folderId, worktreePath, repositoryRelativePath}`、**§9.3 snapshot 补 Folder ID/path 映射**（R19 进一步加入 `folderName` 显示快照）
- [x] **I17** — owner projection 改为可判别 union + longest canonical match；明确 root/worktree 必然嵌套，不得依赖插入顺序

### R14–R15 §11 新增议题（已落入 README 且经 Claude 复核）

- [x] **I18** — apply/archive MCP descriptor 与 ACP 文件系统 scope 同步收窄为 owner-only Folder allowlist
- [x] **I19** — ProposalRef 解析为可信 `ResolvedProposalTarget`；run 固定 target，apply/archive 不接受 caller absolute path；linked 优先由 Phase 5 proposal 从实现行为固化为 requirement
- [x] **I20** — explore 列表允许 per-Folder partial result，但 owner 省略必须在完整成功扫描后证明唯一
- [x] **I21** — proposal tool/state 终态命名改为 `worktreePath/worktreeMode`，移除 Git target 上的 `workspacePath/workspaceMode/projectRoot`

### R16–R17 §13 新增议题（已落入 README 且经 Claude 复核）

- [x] **I22** — aggregate envelope 按 Folder 区分 ready-empty、missing、error 与 item warning，leaf reader 不吞错
- [x] **I23** — Overview 拆分 Workspace work 与 repository governance；partial totals 标完整性，enrichment 不跨 Workspace 读取 subject 内容
- [x] **I24** — ProposalRef、SpecRef、GuidelineRef 贯穿 renderer key、selection、detail lookup/IPC 与缓存

### R18–R20 §14/§16/§18 新增议题（已落入 README 且经 Claude 复核）

- [x] **I25** — reminder 使用 Session/run 固定 snapshot；stale activation 在注入前拒绝；**Claude 已撤回「reminder 每轮重新生成」前提与 `unavailable` 成员形态建议（F40）**
- [x] **I26** — Workspace JSON 安全编码、Folder/名称/字节上限与标记字符覆盖；**两点遗留给实施 proposal**（`WORKSPACE_REMINDER_TOO_LARGE` 恢复路径、阈值定位为 backstop）
- [x] **I27** — task targets 采用显式 stale 状态的软引用，成员移除不改变 owner 默认值
- [x] **I28** — route meta/activity bar 统一迁移 `requiresWorkspace` 与 capability evaluator；**承接 proposal 须把 `guidelines/RendererProcess.md` 的 activity bar 门控条目列为显式交付项（F41）**

### R21–R22 横向一致性对照（已落入 README 且经 Claude 复核）

- [x] **I29** — 成员移除撤销非 active Session 的后续 Agent/MCP/reminder/resource activation；不静默裁剪 snapshot，重新加入后仍走 path missing/relocated 校验
- [x] **I30** — Chat preview 区分 Window trust 与 Agent Session scope，提供 `window-only` 状态和 UI scope diff；**遗留：`sessionId` 归属校验失败须拒绝请求而非降级（F27 原则）**
- [x] **I31** — §25 清除已收敛重复项；**Claude 降级为中并交人类裁决**，Fio 已答复两项（第 2 项另立 I33）
- [x] **I32** — §7 apply/archive run 存储矩阵补齐固定 `worktreePath`

### R22–R24 人类裁决后新增（已落入 README 且经 Claude 复核）

- [x] **I33** — Workspace 删除改为带 `cleanupState` 三态的 `isDeleted` tombstone；恢复入口、显式终态清理、共享 Folder 隔离与 legacy 孤儿处置齐备。**`purging` / `cleanup-failed` 重启后只可重试不可恢复**，超出 Claude 的原要求

### R24–R26 复核 I33 时新发现（已落入 README 且经 Claude 复核）

- [x] **I34** — §7.2 删除失效前提；cutover source 按 `encodeProjectPath(legacyProject.path)` 定位并**持久化为 `legacyAppDataKey` provenance**；历史目录保持 orphan；双目录 fixture 已补
- [x] **I35** — 扩展清理范围：永久删除同时清理 provenance 归属的 retained copy 与同 ID legacy meta record；任一失败保留 `cleanup-failed`；确认文案限定为「可唯一归属」且不承诺法证擦除

### R26–R28 复核 I34/I35 时新发现（已落入 README 且经 Claude 复核）

- [x] **I36** — cutover 对全部 candidate key 分组，仅唯一候选持久化 provenance；碰撞组不认领、不由单 Workspace 删除 legacy source，字段不得作 identity 或 map/registry key

### 本轮碰撞的净结果

R8 我提出 5 项，全部成立；但 **Codex 在 3 项上纠正或超越了我**：

- **I9** — 我误以为 nonce/HMAC 能阻止同机 Agent 重放；F20 证明进程按 `agentId` 共享，同一 Agent 的多 Session 本就在同进程内，请求层凭据无法闭合。**推论撤回。**
- **I12** — 我的三点全部围绕 MCP descriptor，隐含假设「撤销 MCP grant = 撤销访问」。Codex 自检发现 active Agent 已直接持有 `cwd`/`additionalDirectories`，MCP 层撤不回 —— **这个缺口比我提出的原议题更严重**。
- **I13** — 我写的「MCP server 与 Agent 同进程」与实现不符（F21），**分支撤回**。

反向成立的部分：I10 的 lost update（Codex 因我的提问去查代码才发现 F22）、I11 的参数缺失、I12/I13 的语义未定义，均为我提出后被接受并修订。

### 状态提示

截至 R13，I14–I17 全部收敛（F26–F28 已由 Claude 独立核实）。

**本轮碰撞净结果**：我 R11 提出 4 项，**I14 的技术推导被证伪**（F26：trusted-root 命中直接 return，member-derived 路径不写 grant，攻击序列首步不成立），另撤回 2 处事实错误（window reload 会清 grant、§21 未列 preview service）与 1 项实现偏好（缓存 trusted roots —— 外部 `git worktree` 操作使其不可靠）。Codex 则在 I16 补出两处我遗漏的关键点：resource link 需 `worktreePath` 才能区分 main/proposal branch 的同名文件；**§9.3 snapshot 缺 `folderId → folderPath` 映射，导致校验链不可执行** —— 该缺口自 I12 起潜在存在，本轮才暴露。

截至 R10，I9–I13 五项议题全部收敛并经 Claude 逐条 grep 复核（F19–F22 已核实）。R1–R7 的八项议题及两项非阻塞加固也保持已达成一致。

R1–R7 的八项议题及两项非阻塞加固保持已达成一致；执行顺序仍要求独立 `enforce-single-instance-startup` proposal 先于 migration foundation 落地。

### R8 后续章节审查记录

R8 优先处理了 §10、§12；后续章节现已全部完成逐条审查：

- ~~§11 `fyllo-specs`（explore 聚合、ProposalRef 全链路）~~ —— **R14–R15 已审，见 I18–I21**
- ~~§13 Proposal Browser / Specs / Guidelines / Overview 聚合 reader~~ —— **R16 已审，见 I22–I24**
- ~~§14 Tasks / Workflow / Integration~~ —— **R18 已审，见 I27**
- ~~§15 Local File Preview / Attachments / trusted roots~~ —— **R11 已审，见 I14–I17**
- ~~§16 System Reminder~~ —— **R18 已审，见 I25–I26**
- ~~§18 Renderer 状态与 UI~~ —— **R18 已审，见 I28**

**§15 已于 R11 审查完毕**，提出 I14–I17（I15 为阻塞级；I14 的原阻塞定性已由 Claude 在 R13 撤回）。按要求区分的三种授权边界，结论如下：

| 边界                    | 性质                 | 授权依据                                                       | 受 Folder 重定位影响                           |
| ----------------------- | -------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| 窗口级 preview grant    | 会话内临时授权       | member-derived 实时判定（不写 grant）／user-confirmed external | **否** —— 实时判定天然随重定位更新（I14，F26） |
| Session attachment 副本 | Workspace-owned 数据 | 无需路径授权；读副本 ≠ 访问成员目录                            | **否** —— 副本独立（I16-A，F25）               |
| 成员文件 resource link  | 实时引用             | session snapshot 内 `folderId` 校验                            | **是** —— 按 I12 进入 relocated 态（I16-B）    |

这三条边界在原 README §15.1/§15.3 中被混写，是 I14（授权来源）与 I16（副本 vs 引用）的核心问题，现已拆分为 §15.1、§15.3、§15.4。

**R13 状态补充**：README 已拆成 window preview、Session attachment copies、member file resource links 三节；I14–I17 已全部收敛。member/worktree-derived trust 受重定位影响但不产生 grant；user-confirmed external exact-path grant 不从 Folder 派生，文件替换语义留给独立 preview contract。

R14–R15 已完成 §11 审查（I18–I21，Codex 主动提出并修订，Claude 复核通过）。R16–R17 已完成 §13 审查并收敛 I22–I24。R18 已完成 §14、§16、§18 审查，I25–I28 由 Codex 在 R19 修订、Claude 在 R20 复核收敛。

**下一轮为横向对照**：§9.3 snapshot、§10 descriptor、§15 resource link、§16 reminder 是四份关于「当前有哪些 Folder、路径是什么」的独立表述，I16 发现的 §9.3 缺 `folderId → folderPath` 映射说明**跨章节一致性问题不属于任何单一章节，只在接口处显现**，逐章审查无法覆盖。

**范围约束**：后续轮次只审查 multi-root 直接改变的语义（一个 Workspace 多个 Folder、Folder 跨 Workspace 共享、repository owner 显式化）。与 multi-root 无关的既有缺陷即使发现也不在本评审内收敛，另行记录，避免议题发散导致无法收敛。

### R7 终审确认（前 8 项议题）

Claude 已对 R6 的全部声称逐条 grep 独立核实，**结果全部属实**（核实表见 `archive/rounds-R1-R17.md` · I6 · R7）。上述 10 个已勾选条目均确认落地，无虚报、无遗漏。

**R1–R7 阶段性关闭；R8 重启后新增的 I9–I13 已于 R10 全部收敛。** 已确认的实施顺序约束为：

1. `enforce-single-instance-startup` 先于 migration foundation 落地（I2）；
2. `introduce-workspace-model` 承接 I1、I3、I6、I7、I8 的共识结论；
3. 各 proposal 创建时按 §22 要求回写 README §23 的 OpenSpec 归属，使临时 inventory 逐步退化为 traceability 表（I5）。

proposal 创建后，本文档失去评审用途，仅作为决策理由的历史记录；实现与验收以 OpenSpec 为唯一权威（I5 共识结论）。若后续实施中发现新的设计缺口，应新增议题编号（**I37 起**）并继续轮次，不修改已关闭议题的历史记录。

---

## 7. 审查进度

### 逐章审查：已全部完成

| 章节                                                                  | 轮次        | 产出        |
| --------------------------------------------------------------------- | ----------- | ----------- |
| §10 MCP、§12 Cortex                                                   | R8–R10      | I9–I13      |
| §15 Preview/Attachments                                               | R11–R13     | I14–I17     |
| §11 fyllo-specs                                                       | R14–R15     | I18–I21     |
| §13 聚合 reader/Overview                                              | R16–R17     | I22–I24     |
| **§14 Tasks/Workflow/Integration、§16 System Reminder、§18 Renderer** | **R18–R20** | **I25–I28** |

§5–§9、§17、§19–§25 在 R1–R7 的身份/迁移/并发线中已覆盖。**注意这是沿线覆盖而非逐条审查**：§7 存储作用域、§25 待确认产品决策未被单独通读，横向对照轮可顺带抽查。

### 横向一致性对照：R21–R22 已完成并收敛

逐章审查无法覆盖**跨章节接口**的一致性。已有两次实证：

- **§9.3 snapshot 缺 `folderId → folderPath` 映射** —— 在 I12、I16 两轮被碰到，第三次（R12）才由 Codex 发现；
- **I25** —— reminder 的 Folder 集合来源未定义，只有把 §16 与 §9.3/§12 并置才能看出冲突。

对以下四处关于「当前有哪些 Folder、路径是什么」的独立表述做一次并置对照：

| 表述位置                    | 解析策略                   | 来源            |
| --------------------------- | -------------------------- | --------------- |
| §9.3 Session snapshot       | 严格快照                   | I12、I16-C      |
| §10 MCP descriptor          | 严格快照（grant registry） | I12             |
| §15.1 preview trusted roots | **每次实时解析**           | I15             |
| §16 System reminder         | 严格 activation 快照       | I25（R19 修订） |

重点检查：同一份数据在四处是否可能给出**不同答案**，以及这种不一致是否会让 Agent 或用户看到矛盾状态。

**R21–R22 并置结果（已完成）**：严格 snapshot 的三处在 activation 成功时可保持同一答案；真正的缺口不在四处策略之间，而在两条边界上——snapshot 与 current Workspace membership 的**撤销**边界（I29，阻塞），以及实时 Window preview 与 Agent snapshot 的**用户可见**差异（I30）。顺带抽查发现 §25 状态冲突（I31）与 §7 run meta 表遗漏（I32）。四项均已由 Claude 在 R22 复核收敛。

**结论：横向对照轮是必要的。** I29 的授权洞需要把「Folder 可跨 Workspace 共享」这条 multi-root 前提代入 §17.3 × §9.3 才显形，单读任一章都合理；I32 则是 I19 在 R15 收敛后 §7.1 的漏同步，而 §7 自 R7 之后再未被回看。两者逐章审查在结构上都覆盖不到。

**本评审已于 R28 关闭**，36 项议题全部收敛。下一步按 `decisions.md` 拆 OpenSpec proposal，并逐条承接其中「实施阶段待办」的 6 条约束。
