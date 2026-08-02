# Multi-root Workspace · 已确认设计决策

**来源**：`review.md` R1–R28 收敛的 **36 个议题（I1–I36，全部收敛）**
**进行中**：无。**评审已于 R28 关闭**，本文件成为拆 OpenSpec proposal 的唯一依据。
**状态**：已达成一致并落入 `README.md`
**最后更新**：2026-08-02

---

## 用途

本文件是**拆分 OpenSpec proposal 时的决策依据**，只包含已收敛的结论与支撑事实。

- **不含**辩论过程、已撤回的错误推导、待办议题 —— 这些在 `review.md`（进行中）与 `archive/rounds-R1-R17.md`、`archive/rounds-R18-R20.md`、`archive/rounds-R21-R22.md`、`archive/rounds-R23-R24.md`、`archive/rounds-R25-R26.md`、`archive/rounds-R27-R28.md`（历史）中。
- **不是行为契约**。README 与本文件均位于 `references/`，按 I5 共识，实现与验收以 OpenSpec 为唯一权威。
- 每条结论标注对应的 README 章节，便于回查完整表述。

> ⚠️ 若某条结论与已批准的 OpenSpec 冲突，以 OpenSpec 为准，并回写修正本文件。

---

## 实施阶段待办（拆 proposal 时必须承接）

评审关闭时仍有 6 条**未在设计层收敛、但已判定不值得再开评审轮**的约束。它们分散在下方各议题小节中，此处汇总以免遗漏。**承接对应章节的 proposal 必须逐条处理或显式说明不处理的理由。**

| #   | 来源 | 约束                                                                                                                                                                                                   | 承接 proposal             |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 1   | I26  | `WORKSPACE_REMINDER_TOO_LARGE` **缺恢复路径**：错误应指明超限成员并提供编辑入口，对齐 I6 的结构化冲突报告 + UI 跳转编辑与重试                                                                          | reminder / §16            |
| 2   | I26  | 64 KiB 阈值应**明确定位为防御性 backstop**：16 Folder × 120 cp 名称已有界，macOS `PATH_MAX` 下 16 成员约 16 KiB，避免实施者为常规场景优化                                                              | reminder / §16            |
| 3   | I28  | `guidelines/RendererProcess.md:21` 仍记录 legacy 契约「MUST 使用 `ActivityBarItem.requiresProject`」。设计阶段不提前改是对的，但**承接 §18.2 的 proposal 必须把该条目的同步更新列为显式交付项**（F41） | navigation gating / §18.2 |
| 4   | I30  | preview 请求新增的 `sessionId` 是 caller-supplied 参数（与 F27 原则相反）。**归属校验失败时须拒绝请求**，而非降级为省略 `agentScope`，避免成为跨 Workspace 探测 Session snapshot 的 oracle             | preview / §15.1           |
| 5   | I22  | 逐 reader 固化「哪些路径缺失算合法 ready-empty」，避免实施者凭直觉判断                                                                                                                                 | Phase 6 聚合 reader       |
| 6   | I24  | 对照代码确认 `<TransitionGroup>`/虚拟滚动的 key、route query/params 是否承载 detail identity、持久化「上次选中项」的恢复逻辑                                                                           | Phase 6 renderer          |

另有一项**产品决策**留待对应 proposal：Collection Workspace 的 health 展示形态（逐 Folder / 派生单一分数 / 两者并存），见 I4。

> I31 曾留下的「§19 表格需标注作用对象」已由 Codex 在 R23 落地（`Workspace open ·` / `Session activation ·` 前缀），不再列为待办。

---

## 议题索引

| 组  | 议题                                                                | README 章节                                         |
| --- | ------------------------------------------------------------------- | --------------------------------------------------- |
| A   | **I1** 存量 `id`/`path` 不一致与身份契约                            | §5.3 / §6.1 / §20.3 · 身份与迁移                    |
| A   | **I3** 启动门控误伤 fresh install                                   | §20.4 / §20.5 · 迁移门控                            |
| A   | **I2** 迁移阶段无单实例保护                                         | §20.2 / Phase 0 · 单实例前置                        |
| A   | **I4** `healthScore` 迁移归属                                       | §20.3 · healthScore 迁移                            |
| A   | **I6** Folder 重定位破坏 canonical path 唯一映射                    | §5.3 / §6.1 / §8.2 / §8.3 / §20.2 · Folder 重定位   |
| A   | **I7** 路径查找的合法/禁止二分                                      | §5.3 / §6.1 / §8.2 · 路径查找二分                   |
| A   | **I8** Folder registry mutation 并发竞态                            | §6.1 / §17.4 · registry 并发                        |
| B   | **I9** MCP token 无 session 绑定（跨 Workspace 越权）               | §10.4 · MCP 授权模型                                |
| B   | **I13** stdio transport 无法表达 v1 授权模型                        | §10.5 · stdio 信任模型                              |
| B   | **I18** Apply/Archive MCP descriptor 未随 owner scope 收窄          | §9.4 / §10.2 / §10.3 · apply/archive owner-only MCP |
| C   | **I12** MCP descriptor 快照与 Folder 重定位的一致性未定义           | §8.2 / §8.3 / §17.4 · descriptor 快照与重定位       |
| C   | **I15** trusted roots 仍按单 `projectPath` 解析，未覆盖成员集合     | §15.1 / Phase 3 · trusted roots                     |
| C   | **I14** preview 授权来源未区分（member-derived vs user-confirmed）  | §15.1 · preview 授权来源                            |
| C   | **I16** resource link 与 attachment 副本的授权边界未分离            | §15.3 / §15.4 / §9.3 · attachment 与 resource link  |
| C   | **I17** owner projection 的「禁止嵌套」前提已被 I6 收窄             | §15.2 · owner projection                            |
| D   | **I19** ProposalRef 与实际 worktree target 的绑定不足               | §11 · ProposalRef 与 worktree target                |
| D   | **I20** Explore 在 partial failure 下无法证明 owner 唯一            | §11.6 · explore owner 唯一性                        |
| D   | **I11** `trace-file` 的 `worktreePath` 来源未定义                   | §12.3 · trace-file                                  |
| D   | **I10** Repository lineage index 的 `workspaceId` 单值假设          | §12.3 · lineage index v2                            |
| D   | **I21** `workspacePath/workspaceMode` 与顶层 Workspace 术语冲突     | §4 / §11 · 命名终态                                 |
| E   | **I5** 第 23 章测试矩阵的权威性归属                                 | §21 / §22 / §23 · 文档权威性                        |
| F   | **I22** Aggregate reader 无法区分合法空数据、missing 与读取失败     | §13.1 / §19 / Phase 6 · aggregate reader 三态       |
| F   | **I23** Overview 混合 Workspace work 与 repository governance scope | §13.5 · Overview 两层读取                           |
| F   | **I24** Repository-local item identity 在跨 Folder 列表中碰撞       | §13.2 · repository document identity                |
| G   | **I25** System reminder 的 Folder 集合来源与 snapshot 漂移          | §9.3 / §16 · reminder 数据来源                      |
| G   | **I26** reminder 注入 folderPath/folderName 缺少注入防护约束        | §5.1 / §16 / §19 · reminder 编码与边界              |
| G   | **I27** Task 的 `targetFolderIds` 未定义成员移除后的语义            | §14.1 / §17.3 / §20.3 · task target 引用完整性      |
| G   | **I28** Navigation gating 的 `requiresProject` 迁移面更广           | §18.2 / §23.8 / §26 · 导航门控迁移面                |
| H   | **I29** 非 active Session 的成员移除缺少 membership revocation      | §5.4 / §9.3 / §17.3 / §19 · membership revocation   |
| H   | **I30** 实时 preview 与 Agent snapshot 的差异缺少用户可见 contract  | §15.1 / §19 · preview 与 Agent scope 差异           |
| H   | **I31** §25 待确认列表与「设计已收敛」状态冲突                      | §25.2 · 待产品确认项                                |
| H   | **I32** §7 apply/archive run 存储表遗漏固定 `worktreePath`          | §7.1 / §11.3 · run target snapshot                  |
| I   | **I33** Workspace 删除继承了已被 multi-root 废除的可恢复性前提      | §6.1 / §7.1 / §8.1 / §17.3 / §19 · tombstone 删除   |
| J   | **I34** §7.2 的 I1 失效前提污染 §20.3 的 app-data 源定位            | §7.2 / §20.3 · 迁移 source provenance               |
| J   | **I35** 永久删除不覆盖 legacy app-data 副本                         | §7.1 / §17.3 / §20.4 · retained copy 清理           |
| J   | **I36** `legacyAppDataKey` 的唯一归属在有损编码下不被保证           | §7.2 / §19 / §20.3 / §20.4 · candidate key 唯一性   |

---

## A. 身份、迁移与并发基础

### I1 · 存量 `id`/`path` 不一致与身份契约

**README**：§5.3 / §6.1 / §20.3 · 身份与迁移

以下五条双方一致，已落入 README §5.3、§6.1、§20.3、§23.1、§23.2、§24：

1. cutover 必须覆盖 `legacyProject.id !== encodeProjectPath(legacyProject.path)` 的存量记录，保留 legacy ID，以有效 `meta.path` 的 canonical 结果建立 registry 反向解析；
2. Folder registry 必须支持从 canonical path 唯一解析已有 Folder（存储形式由 proposal 决定；§20.2 的禁令已收窄为「不引入 legacy ID ↔ 新 ID 的迁移映射表」）；
3. 新运行期不得对已有 Folder 重新计算 `folderId`；
4. 增加 `id/path` 不一致的迁移测试与重复「打开文件夹」测试；
5. **两个 legacy Project canonicalize 后碰撞时，cutover 保留全部 source、报告冲突并失败**，不启发式择一或自动合并；修复通过新迁移 ID 进行。

### I3 · 启动门控误伤 fresh install

**README**：§20.4 / §20.5 · 迁移门控

门控条件：

```text
required cutover satisfied =
  executed record is success
  OR
  executed record does not exist AND requiredCutoverId <= baselineId
```

README §23.2 增加交叉用例：fresh install 被 baseline 覆盖后，可正常进入空数据 Workspace runtime，不要求预先存在任何 Workspace/Folder 记录。

### I2 · 迁移阶段无单实例保护

**README**：§20.2 / Phase 0 · 单实例前置

技术方案一致（迁移前取得单实例锁；未取得锁的第二实例不得启动迁移与其他 app-data writer；bootstrap 测试证明单实例判定早于 migration runner；不引入跨进程锁协议）。

**交付形式已达成一致**：作为独立的 `enforce-single-instance-startup` OpenSpec proposal 交付，而非无 proposal 的直接提交，也不并入 Workspace foundation。该 proposal 须同时定义第二实例的用户可见行为（退出/聚焦/转交打开请求），因现有 `project-window` spec 未覆盖该场景。Phase 0 要求其先于 migration foundation 落地；`introduce-workspace-model` 只依赖并验证该前置能力。

### I4 · `healthScore` 迁移归属

**README**：§20.3 · healthScore 迁移

- README §20.3 增加：legacy `ProjectMeta.healthScore` → 对应 `FolderMeta.healthScore`，并补迁移保留测试；
- Collection Workspace 的 health 展示形态（逐 Folder / 派生单一分数 / 两者并存）留给 Workspace UI proposal 决定；
- 在该产品决策完成前，参考设计不臆定平均值、最低值或加权算法。

### I6 · Folder 重定位破坏 canonical path 唯一映射

**README**：§5.3 / §6.1 / §8.2 / §8.3 / §20.2 · Folder 重定位

**主体已达成一致并落入 README**：registry 双向解析、不透明 ID 分配、重定位保留 `folderId`、exact-path 全局唯一、嵌套按 Workspace 作用域校验、冲突整体拒绝、共享 Folder 影响范围与确认提示、§23.3/§24 覆盖条目。

**部分引用 Workspace 冲突语义已达成一致**：整次重定位原子拒绝，返回结构化冲突报告；UI 列出冲突 Workspace/Folder/路径关系并提供进入对应 Workspace 编辑的操作，解除冲突后允许重试。v1 不支持强制重定位、自动移除成员或局部成功。

### I7 · 路径查找的合法/禁止二分

**README**：§5.3 / §6.1 / §8.2 · 路径查找二分

canonical path 是 Folder registry 的合法反向查找输入，但不是 Folder ID 的派生规则。新运行期必须先查 registry、未命中才分配与路径无关的新 ID；不得根据当前 path 重算已有 ID。

### I8 · Folder registry mutation 并发竞态

**README**：§6.1 / §17.4 · registry 并发

Folder registry 的并发不变量已落入 README §6.1 与 §17.4：

1. 所有改变 canonical path ↔ `folderId` 关系的操作由 Main 中同一串行化 mutation boundary 拥有；
2. `resolveOrCreateFolder()` 的「查找—分配 ID—写入」为原子操作；
3. `relocateFolder()` 的「全局 exact-path 校验—所有引用 Workspace 校验—更新路径/反向索引」为原子操作；
4. 失败不得留下新 Folder、部分反向索引或部分 Workspace projection；reader 只能观察 mutation 前或后的完整状态；
5. §23.3 增加多窗口并发打开同一路径只产生一个 Folder/Folder Workspace 的覆盖条目。

实现方式（进程内 mutex / 串行队列 / storage transaction）由 foundation proposal 选择。

---

## B. MCP 授权与传输

### I9 · MCP token 无 session 绑定，multi-root 后成为跨 Workspace 越权通道

**README**：§10.4 · MCP 授权模型

**授权模型**（README §10.4）：

1. Main 为每次 probe/new/load/resume MCP activation 签发独立短期 opaque bearer，映射到 Main-owned registry 中不可变的 descriptor、Session、允许的 server、有效期与 activation 状态；
2. proxy 以 bearer 对应 grant 为授权主体，**移除 caller-supplied `X-Fyllo-*` headers**，注入 grant 内可信 descriptor，转发 backend 时换成不暴露给 Agent 的 host-internal token；
3. activation 关闭/取消/替换、Agent invalidation 时撤销；host restart 全部失效；load/resume 重发新 bearer；
4. **信任边界显式停在 trusted Agent runtime**：攻陷 Agent executable 或读取同进程其他 Session 内存的场景，per-activation bearer 只缩小泄漏窗口，不提供进程内隔离；
5. §23.5 覆盖并存 Session 各持不同 bearer、伪造主体 headers、错误 server、过期/撤销/host restart、load/resume 换 token、proxy/backend token 分层。

### I13 · stdio transport 无法表达 v1 授权模型

**README**：§10.5 · stdio 信任模型

**stdio 信任模型**（README §10.5，同步 §20.6/Phase 4/§23.5/§24/§25）：

1. stdio child 按 MCP activation **独立启动且不可跨 Session 复用**；`FYLLO_WORKSPACE_JSON` 是不可变启动配置，**不是密码学身份证明**；
2. tool call 仍只接受 snapshot 内 `folderId`，不接受 caller absolute path；
3. v1 显式信任 Agent runtime 不篡改 env、不复用 child —— 理由是该 runtime 本就获得 Session 的 `cwd`/`additionalDirectories`，无进程 sandbox 时 env 完整性无法约束恶意 Agent executable；
4. 不能满足该 trust contract 的 Agent **不启用 multi-root stdio bundled MCP**；未来收紧时 env 只传 opaque token，Folder 解析回 Main-owned local socket；
5. §23.5 明确记录 **stdio 与 HTTP 的授权模型不等价**，而非假定等价。

### I18 · Apply/Archive MCP descriptor 未随 owner scope 收窄

**README**：§9.4 / §10.2 / §10.3 · apply/archive owner-only MCP

apply/archive activation 的 `McpWorkspaceDescriptorV2.folders` **恰好包含 owner Folder**，`primaryFolderId` 等于 owner；descriptor Folder 集合由 activation owner 决定（Chat/probe 用 Session snapshot，apply/archive 用 run owner）；grant 内 folders 是 tool resolver 的**完整 allowlist**，不得回查 Workspace registry 扩权；§10.3 的"完整 Folder 集合"收窄为"该 activation 的完整授权集合"。

**范围界定**：同一 repository 内 Agent 操作其他 proposal 属既有信任问题，不在本轮 multi-root scope 内。

---

## C. Session 快照与路径授权

### I12 · MCP descriptor 快照与 Folder 重定位的一致性未定义

**README**：§8.2 / §8.3 / §17.4 · descriptor 快照与重定位

**严格快照 + active runtime 拒绝**（README §8.2/§8.3/§17.4/§19/§23.3–23.5/§24/§25）：

1. descriptor 只存于 Main grant registry，作为 proxy → backend 的可信不可变 Session 快照；其中 `folderPath` 是**快照权威值**，不是 live registry cache；
2. Main 在 resume/load 与路径相关 MCP 调用前用 `folderId` 对照 current registry **只做 stale 检测，不改写路径**；路径不存在返回 `SESSION_FOLDER_PATH_MISSING`，已重定位返回 `SESSION_FOLDER_RELOCATED`；
3. 旧 Session 只允许查看持久化内容，不能恢复 Agent 或继续路径相关 tool；修复后须新建 Session（避免旧路径被复用后静默访问错误 repository）；
4. **存在 probe/chat/apply/archive runtime 使用该 Folder 时，`relocateFolder()` 以 `FOLDER_RELOCATION_ACTIVE_RUNTIME` 原子拒绝**并返回引用，用户关闭运行态后重试；**不得先改 registry 再异步关闭共享 Agent 进程**（进程按 `agentId` 共享，见 F20）；
5. 只有非 active 的 resumable Session 在重定位后进入 `SESSION_FOLDER_RELOCATED`；重定位确认界面列出受影响 Session 并提示不会跟随新路径；v1 不提供快照原地迁移。

### I15 · trusted roots 仍按单 `projectPath` 解析，未覆盖成员集合

**README**：§15.1 / Phase 3 · trusted roots

**trusted roots 实时解析**（README §15.1、Phase 3、§19、§23.3、§24）：

1. service context 改为 `{workspaceId, availableFolders, sender}`，由 handler 从 sender 取得 Workspace 后传入；**public IPC schema 不变**（F27）；missing 成员不进入 `availableFolders`；
2. 每次 `preparePreview` 重新取得 `ResolvedWorkspace`，对 available members **并行**枚举 worktrees；**v1 不缓存授权 roots** —— 外部 `git worktree add/remove` 无法被 I8 mutation boundary 感知，缓存不可靠；
3. 单成员 worktree 枚举失败 → 该成员 worktrees 视为空、保留 canonical folder root + warning；folder root canonicalize 失败 → 排除该成员；其他成员不受影响；
4. 未来短 TTL 优化不得改变「每次请求观察当前成员/registered worktrees」的授权语义。

### I14 · preview 授权来源未区分（member-derived vs user-confirmed）

> 原议题标题为「grant key 缺 Folder 维度，重定位后 grant 残留」；该技术推导已由 Claude 在 R13 依据 F26 撤回，仅文档缺口成立。

**README**：§15.1 · preview 授权来源

**preview 授权来源二分**（README §15.1）：

1. **member/worktree-derived trust** —— 每次由 trusted roots 实时判断，**不写 remembered grant**；Folder 重定位后旧 root 自然退出，无需主动清除；
2. **user-confirmed external exact-path grant** —— 保留 `workspaceId + canonicalPath`，按 sender 隔离，**不绑定 Folder**（remembered grant 只有这一种来源，加 `folderId` 会重新混淆）；
3. 文件被替换/删除是否撤销 grant，属既有 preview contract 的安全策略，留给独立 proposal，不借本方案暗改；
4. §23.3 覆盖重定位后旧 root 不再自动可信、external grant 不跨 Workspace/window；**不新增 §19 错误行**，因为此处不存在需要返回的 relocation error。

### I16 · resource link 与 attachment 副本的授权边界未分离

**README**：§15.3 / §15.4 / §9.3 · attachment 与 resource link

**A. Attachment 副本**（README §15.3）：位于 `<workspaceDataDir>/sessions/<sessionId>/attachments`，**不受成员移除、Folder 重定位或原文件删除影响**；renderer 只持有 Workspace/Session-scoped **opaque handle**，任意 `file://` URI 不构成读取权限；message 不持久化 app-data absolute path，仅在构造 ACP payload 时由 Main 解析；随 Session 删除。

**B. Resource link**（README §15.4）：结构为 `{folderId, worktreePath, repositoryRelativePath}` —— `folderId` 定 owner，`worktreePath` 是捕获时的 main/registered worktree 快照，相对路径不得逃逸；capture / Agent dispatch / resume / 再次 preview 均校验 Session snapshot、Folder relocation/missing 与 worktree registration；重定位返回 `SESSION_FOLDER_RELOCATED`，worktree 移除返回 unavailable **且不回退 main worktree**；新增成员不扩张旧 Session 授权。

**C. §9.3 Session snapshot 加固**：改为 `folders: Array<{folderId, folderPath}>`，显式携带 ID→path 映射（原 schema 无此映射，导致 B 的校验链不可执行）；定义 primary/cwd/additionalDirectories 一致性；missing 成员不进入授权 snapshot。

### I17 · §15.2 owner projection 依赖的「禁止嵌套」前提已被 I6 收窄

**README**：§15.2 · owner projection

README §15.2 改为可判别的 `PreviewTrustedRoot` union：同一 Workspace 的不同 Folder roots 不嵌套，跨 Workspace 嵌套不会同时进入当前 window context；**Folder root 与其 linked worktree 必然嵌套，因此 longest canonical root match 是必要算法而非可选优化**；必须按 canonical path 分段长度选最具体 candidate，不得依赖 Set/数组插入顺序；member-derived 结果返回明确 `folderId` 与实际 `worktreePath`，external target 不伪造 owner；§23.3 覆盖 worktree target 胜过 Folder root。

---

## D. Proposal 与 lineage

### I19 · ProposalRef 与实际 worktree target 的绑定不足

**README**：§11 · ProposalRef 与 worktree target

1. 新增 `ResolvedProposalTarget { proposalRef, worktreeMode, worktreePath }`：**ProposalRef 是身份，target 是 runtime 解析结果**；
2. apply/archive input **移除 caller `targetPath`/`worktreePath`**，只接受 `folderId + changeName`；
3. resolver 只在 owner Folder 的 main/registered worktrees 内查找；main + 单一 linked 重名时 linked 优先，多个 linked candidate 返回 `PROPOSAL_LOCATION_AMBIGUOUS`；
4. apply run 创建时固定 `folderId + worktreePath`，所有 stage/archive 复用；target 消失、不再 registered 或不再含该 change 时明确失败，**不回退 main、不另选 worktree**；
5. create-proposal 返回实际 target；ProposalRef 已存在时返回 `PROPOSAL_ALREADY_EXISTS + existing target`，不写 created event、不生成第二 origin。

**待 Phase 5 proposal 补充**：linked-preferred 目前只是实现行为，未见于任何 OpenSpec requirement（Claude R15 核实），应显式固化。

### I20 · Explore 在 partial failure 下无法证明 owner 唯一

**README**：§11.6 · explore owner 唯一性

1. 无 owner 时只并行扫描 **activation descriptor 中的授权 Folder**，不回查 Workspace registry；
2. active change item 必带 `folderId/folderName/changeId/worktreeMode/worktreePath`；**dedupe 只在同一 Folder repository 内进行，不跨 Folder 按 changeId 去重**；
3. per-Folder failure 返回带 `folderId` 的结构化 warning，其他结果仍返回；
4. `currentChange` 省略 owner 时，**必须所有目标 Folder 扫描成功且恰好一个 ProposalRef match**；多 match 返回 `PROPOSAL_OWNER_AMBIGUOUS + candidates`，任一 scan 失败返回 `PROPOSAL_OWNER_UNVERIFIED`；
5. 两种情况均**不回退 primary、不选第一项**；stale Session 先按 §9.3 拒绝。

**核心二分**：列表允许 partial（信息呈现，可降级）；owner 决策要求完整证明（授权前提，不可降级）。

### I11 · `trace-file` 的 `worktreePath` 来源未定义

**README**：§12.3 · trace-file

`trace-file({ folderId, worktreePath?, filePath, lineRange? })`（README §12.3）：省略 `worktreePath` 时用 Folder main worktree；提供时须经 §6.3 `ResolvedRepositoryTarget` 校验为该 Folder 的 registered linked worktree；`filePath` 为目标 worktree 的 repository-relative path，canonicalize 后不得逃逸；响应回传实际 `folderId` 与 `worktreePath`；§23.7 覆盖 main/linked worktree 历史差异与逃逸拒绝。

### I10 · Repository lineage index 的 `workspaceId` 单值假设

**README**：§12.3 · lineage index v2

**Repository lineage index v2**（README §12.3）：

1. `proposals` / `commits` value 改为 `RepositoryLineageRelation[]`，每项 `{ workspaceId, subjectId, relation: "origin" | "reference", linkedAt }`；
2. proposal 创建写 proposal origin；产生 apply/archive commit 的 subject 写 commit origin。**每个 repository object 最多一个 origin**，第二个不同 origin 返回冲突并保留原值；其他 Workspace 延续/apply/archive 已有 proposal 时幂等追加 reference；
3. 查询分开返回唯一 origin 与全部 references；缺失/损坏 origin 返回 `origin: null` + warning，**不按最后写入者猜测**；
4. **不复用 Folder registry mutation boundary**，使用独立 per-index-file Main transaction，在 I2 单实例前置下把「读取最新值—校验 origin—幂等追加—temp + atomic rename」**整体**串行化（现有实现读取在写队列之外，仅串行化写入会 lost update）；
5. §20.3 规定 legacy 单值转为单元素 origin relation，`linkedAt` 取自 proposal `createdAt` 或 subject `updatedAt`；无法唯一确定 Folder/subject 时迁移失败而不猜测。§23.7 覆盖 origin 保持、reference 幂等、并发追加与迁移。

### I21 · `workspacePath/workspaceMode` 与顶层 Workspace 术语冲突

**README**：§4 / §11 · 命名终态

目标命名终态：顶层 `workspaceId/workspaceKind/workspaceDataDir`；Folder 用 `folderId/folderPath`；**Git 执行位置一律用 `worktreePath/worktreeMode`**；`create-proposal.workspaceMode` → `worktreeMode`；proposal lifecycle success state 返回 `ResolvedProposalTarget`，不再返回或持久化 `projectRoot/workspacePath/workspaceMode`；tool instruction 以 `worktreePath` 为 artifact 根。legacy 名称只允许出现在现状 inventory 与升级实现中。

---

## E. 文档与流程

### I5 · 第 23 章测试矩阵的权威性归属

**README**：§21 / §22 / §23 · 文档权威性

第 23 章定位为**临时覆盖 inventory**，非独立验收契约。生命周期：

1. §21 的 Phase 与退出条件只描述依赖、顺序与覆盖目标，不构成验收权威；
2. 创建每个 proposal 时，将其负责条目转换为精确 OpenSpec requirement/scenario、tasks 与验证命令；
3. proposal 建立后，README 对应详细条目替换为「条目 → owner proposal/spec」追踪关系，不再维护测试措辞副本；
4. 条目与已批准 OpenSpec 冲突时以 OpenSpec 为准；
5. 终态：§23 只保留跨 proposal 追踪表，OpenSpec 为唯一实现与验收权威。

---

## F. Repository 聚合与 Overview

### I22 · Aggregate reader 无法区分合法空数据、missing 与读取失败

**README**：§13.1 / §19 / Phase 6 · aggregate reader 三态

**三层结果模型**（README §13.1）：

1. `RepositoryAggregateResult<T>` + per-Folder `RepositoryReadResult<T>` 判别联合，状态 `ready | missing | error`；Folder 结果按 Workspace 成员顺序返回；
2. available Folder 并行读取，单个失败不隐藏其他 ready data；仅当 Workspace/auth/aggregate contract 无法建立时整体失败；
3. **leaf reader 必须区分合法空与失败**：可选目录不存在按页面 contract 返回 ready-empty；permission/I/O/Git 或无法继续解析的错误必须上抛（当前实现全部吞掉，见 F33）；
4. missing Folder 只产生 Folder-level state；仅 Session/EventRail 等已持有 ProposalRef 的入口才显示 item-level unavailable；
5. **Folder filter/badge 只在 Workspace 配置本身恰好一个 Folder 时隐藏**；多成员 degraded Workspace 即使只有一个 available Folder 也保留 missing/error scope（避免把 degraded 伪装成 single-folder）；
6. 三态只描述**页面级 reader 是否产出可用数据**；`ready` 不代表所有子能力成功。`unsupported` 等 reader-specific capability state 表达在 `data` 内，非致命失败经 `warnings` 暴露；**不进入基础联合**（否则 Specs/Guidelines 被迫承担无效状态，且 `unsupported` 与 `ready` 不互斥）。

**待 Phase 6 proposal 细化**：逐 reader 固化「哪些路径缺失算合法 ready-empty」，避免实施者凭直觉判断（Claude R17 建议）。

### I23 · Overview 混合 Workspace work 与 repository governance scope

**README**：§13.5 · Overview 两层读取

**两层读取 + 一次 projection**（README §13.5）：

1. **Workspace reader 只从当前 `workspaceDataDir` 读取一次** sessions/tasks/lineage/knowledge（不按 Folder 重复读取；迁移后 app-data 按 `workspaceId` 定位，传 `folderPath` 读不到数据）；
2. N 个 repository reader 按 Folder 并行读取 specs/guidelines/proposals/archive/Git，保留 per-Folder identity/status；
3. `WorkspaceOverview` 分为 `work` / `repositories` / `memberHealth` / `aggregate`；**aggregate 只汇总 ready repositories**，返回 `complete` 与未计入 Folder，partial sum 不得标成完整总数；
4. active proposal 的 enrichment **只读当前 Workspace 的 subject/reference**，无 link 时返回 null；**reverse index 的 origin/reference 不构成读取另一 Workspace subject 内容的授权**（与 I10 互补：I10 定义索引结构，此处定义读取授权）。

### I24 · Repository-local item identity 在跨 Folder 列表中碰撞

**README**：§13.2 · repository document identity

**Repository document identity**（README §13.2）：

1. Proposal 用 `ProposalRef {folderId, changeId}`；新增 `SpecRef {folderId, specId}` 与 `GuidelineRef {folderId, path}`；
2. **list key、selected state、detail lookup/IPC、缓存全部使用完整 ref**，不只用 local id/path；详情内嵌在 aggregate data 时也按完整 ref 做 client-side lookup（当前 `find()` 未命中会回退首项，见 F35）；
3. All Folders 中同名内容同时展示并分别打开；Folder filter 只改变可见集合，**不改写已打开 detail 的 owner**；
4. Specs/Guidelines relative path 只在对应 Folder 内解析并做逃逸校验（与 I11 一致）。

**待 Phase 6 对照代码确认**（Claude R17，不阻塞）：`<TransitionGroup>`/虚拟滚动的 key、route query/params 是否承载 detail identity、持久化「上次选中项」的恢复逻辑。

---

## G. System reminder、Task 引用与导航门控

### I25 · System reminder 未定义 Folder 集合来源，与 Session snapshot 漂移

**README**：§9.3 / §16 · reminder 数据来源

1. **Chat/probe reminder 的 Workspace 动态数据只能从 `SessionWorkspaceSnapshot` 投影**，不得读当前 registry 补成员、替换重定位后的 path 或刷新名称（§9.3、§16）。
2. **snapshot 成员扩展为 `{folderId, folderName, folderPath}`**。`folderName` 是 reminder 的显示快照，`folderId` / `folderPath` 才是授权与路径校验字段；Folder 重命名不改写旧 Session 的 reminder。
3. **stale 检测先于 activation 与 reminder 注入。** 检测到 missing/relocated 时不构造「部分可用」reminder，也不注入 registry 新路径，直接以 `SESSION_FOLDER_PATH_MISSING` / `SESSION_FOLDER_RELOCATED` 让 activation 失败；历史消息仍可只读查看。
4. **不引入 `unavailable` 成员形态** —— §9.3 既已规定 missing/relocated 不恢复 Agent，再生成描述「不会获得的授权集合」的 reminder 只会制造第三种状态。
5. **apply/archive reminder 从 owner-only `McpWorkspaceDescriptorV2` 与 run 固定的 `ResolvedProposalTarget` 投影**，不从 current primary 或 registry 重选；固定 target 失效时按 §11.3 在注入前失败。

**Claude R20 撤回**：R18 提出的「reminder 每轮重新生成」前提与由其推出的 `unavailable` 建议均不成立，见 F40。

### I26 · reminder 注入 folderPath/folderName 缺少注入防护约束

**README**：§5.1 / §16 / §19 · reminder 编码与边界

1. **动态数据必须作为不可执行数据编码**：成员对象与数组统一 `JSON.stringify`，随后对整段 JSON 执行与现有 `escapeAngleBrackets()` 等价的编码，把尖括号输出为 Unicode 转义序列（`u003c` / `u003e`，前置反斜杠）；禁止 YAML-like 无引号列表或逐行字符串插值；动态值不得进入 XML tag、属性或静态规则文本。这是复用既有 OpenSpec contract（`openspec/specs/fyllo-action-prompt-contract/spec.md:84-104`），不是新规则。
2. **静态规则必须声明** JSON 字段值是 Workspace 元数据而非 Agent 指令，任何 `folderName` / `folderPath` 内容都不能改变外层 reminder contract。
3. **边界**：v1 Workspace 最多 16 个 Folder（§5.1 不变量，创建/编辑/repair 均拒绝超限）；reminder 显示的 `folderName` 最多 120 个 Unicode code point，超长保留前 119 个并追加 `…`（只影响显示值，不改 snapshot）；`folderId` 与完整 `folderPath` 不截断。
4. **authorized folders 完整输出，不分页、不省略** —— 分页会让 reminder 描述的授权集合与实际不符。编码后 Workspace JSON 上限 64 KiB（UTF-8），超限以 `WORKSPACE_REMINDER_TOO_LARGE` 拒绝 activation，不截断路径或成员列表。

**遗留给实施 proposal 的两点**（Claude R20，不阻塞）：

- `WORKSPACE_REMINDER_TOO_LARGE` **需要恢复路径**：错误应指明超限成员并提供编辑入口，对齐 I6 的 `workspaceConflicts` 结构化报告 + UI 跳转编辑与重试；否则用户只会看到「chat 打不开且不知道改什么」。
- 该阈值应**明确定位为防御性 backstop 而非常规路径**：16 Folder × 120 cp 名称已有界，唯一不截断的 `folderPath` 在 macOS `PATH_MAX` 1024 下 16 个成员仅约 16 KiB，只有 Linux/Windows 长路径叠加大量非 ASCII 的 `\uXXXX` 膨胀才可能触及 64 KiB。避免实施者为常规场景优化。

**附带结论**：因 `folderName` 有 120 cp 硬截断，外部来源的目录名无法把 JSON 撑过 64 KiB，该上限**不构成攻击者可控的 chat 拒绝服务面**。

### I27 · Task 的 `targetFolderIds` 未定义成员移除后的语义

**README**：§14.1 / §17.3 / §20.3 · task target 引用完整性

1. **`targetFolderIds` 是软引用**，不进入 §17.3 的成员移除阻塞检查；移除成员时不改写 task。
2. **读取时投影为 `currentTargetFolderIds` 与 `staleTargetFolderIds`**；UI 必须显示失效 target 数量并允许用户编辑，不得静默删除悬空 ID。
3. **owner 预选需三条件同时成立**：原始去重后的 `targetFolderIds` 恰好一个、该 ID 仍是当前成员、且可作为 proposal owner。**原始 target 多于一个时，即使过滤后只剩一个有效成员也必须确认** —— 判定基准是原始 cardinality 而非过滤后集合，避免一次成员移除远距离改变另一个 task 的默认 owner（§5.4 反漂移）。
4. **legacy task 迁移后省略 `targetFolderIds`**，不根据迁移得到的唯一 Folder 猜测 repository hint。

### I28 · Navigation gating 的 `requiresProject` 迁移面比 §18.2 描述更广

**README**：§18.2 / §23.8 / §26 · 导航门控迁移面

1. **route meta 与 `src/renderer/src/config/activity-bar.ts` 的 `ActivityBarItem` 必须同步迁移到 `requiresWorkspace`**，两处使用**同一个** Workspace navigation gate evaluator；activity bar 的 visible/disabled 与路由进入判断必须得到相同结果。
2. **实施时全仓清点所有 `requiresProject` 读写点**，不能把 §26 的文件清单当成穷尽集合。
3. **task/knowledge/workflow 只要求窗口已绑定有效 Workspace**，不以 `availableFolders.length` 或 secondary missing 禁用；repository/Git 类入口才消费对应 member capability。
4. **§26 影响面索引已加入** `activity-bar.ts`、`ActivityBar.vue` 与 route meta/guard consumers。

**承接 proposal 的显式交付项**（Claude R20）：`guidelines/RendererProcess.md` 仍记录 legacy 契约「MUST 使用 `ActivityBarItem.requiresProject` 表达项目门控导航」。参考设计阶段**不提前修改**该 guideline 是正确的（guidelines 描述当前代码的真实契约），但承接 §18.2 的 proposal 必须把该条目的同步更新列为显式交付项，否则这条约定会随本文档失效而丢失（F41）。

---

## H. 横向一致性对照（R21–R22）

### I29 · 非 active Session 的成员移除缺少 membership revocation

**README**：§5.4 / §9.3 / §17.3 / §19 · membership revocation

1. **Session snapshot 只冻结本次授权的 identity/path，不永久覆盖 Workspace membership 撤销**（§5.4 不变量）。非 active Session 仍不阻止成员移除，历史内容保留。
2. **resume/load 必须校验 snapshot 中每个 `folderId` 仍属于当前 Workspace**；成员已移除时进入 `SESSION_FOLDER_REMOVED`。**不得因该 Folder 仍存在于全局 registry 而恢复授权**（Folder 可被其他 Workspace 引用，全局 registry 校验通不过 membership 撤销），**也不得把 snapshot 静默裁剪为剩余成员**。
3. 同一 `folderId` 重新加入后，仍继续执行 path missing/relocated 校验——removed 态不得成为绕过其余两种 stale 检测的旁路。
4. **移除确认必须列出将进入 `SESSION_FOLDER_REMOVED` 的 Session**（§17.3）。
5. resume/load、MCP descriptor、reminder 与结构化 resource ref 统一适用该撤销语义。

### I30 · 实时 preview 与 Agent Session snapshot 的差异缺少用户可见 contract

**README**：§15.1 / §19 · preview 与 Agent scope 的差异表达

**前提**：四处解析策略不统一**本身不是缺陷**（各有 I12/I15/I25 的已收敛理由），缺口在 UI 层没有表达这个分歧。

1. **成员新增/恢复后**：window preview 立即信任新 root，已有 Session snapshot / MCP descriptor / reminder 不扩张；**成员移除后相反**：window preview 立即停止自动信任，旧 Session 按 §9.3 进入 `SESSION_FOLDER_REMOVED`。
2. **Chat/Session 界面发起的 preview 携带 `sessionId` 仅作 scope-comparison context**，不构成 path 授权；实际读取仍只由当前 Window/Workspace trusted roots 或 user-confirmed grant 决定。Main 从 sender 取 `workspaceId` 后校验 Session 归属。
3. **响应增加 `agentScope: "authorized" | "window-only"`**：member-derived target 只有在 `folderId` 与 snapshotted `folderPath` **都**匹配、且 Session 未 stale 时才是 `authorized`；未进入旧 snapshot 的新增/恢复 Folder 与 user-confirmed external target 均为 `window-only`。
4. **`window-only` 允许查看但不得持久化为 `WorkspaceFileResourceRef` 或 dispatch 给 Agent**；正当出路是新建 Session 或转为 §15.3 的 attachment copy。
5. Chat header 以 Session snapshot 展示 Agent 实际授权，并在与当前 Workspace 成员/primary 不同时显示 snapshot 提示。

**遗留给实施 proposal**（Claude R22，不阻塞）：F27 确立过 public preview IPC 刻意不接受 caller 提交的 identity。新增的 `sessionId` 是 caller-supplied 参数，设计**未定义归属校验失败时的行为**。应明确：`sessionId` 不属于 sender Workspace 时**拒绝请求**，而非降级为省略 `agentScope`，避免成为跨 Workspace 探测 Session snapshot 的 oracle。

### I31 · §25 待确认列表与「设计已收敛」状态冲突

**README**：§25.2 · 待产品确认项

1. §25.2 清理为只保留真正未收敛项；Session snapshot、重复/嵌套成员、单 proposal owner、apply/archive owner-only scope、repository 默认 All Folders + filter 五项已分别由 I12/I6/I18/I24 收敛，移出待确认列表。
2. **定级原则**（Claude R22）：「产品方尚未确认」不是设计缺陷，不应标为阻塞——reviewer 无权代产品方确认，author 也不应单方作答。此类项按协作规则第 7 条**设计侧收敛、产品侧交人类裁决**。
3. **Fio 裁决（R22）· primary missing**：维持设计现值——阻止进入正常 Workspace，launcher 提供修复/重新定位入口；secondary missing 仍允许 degraded mode。该值已被 I15、I28 的结论依赖，且 §8.3:484 确认 launcher 修复入口存在。
4. **Fio 裁决（R22）· Workspace 删除**：不采纳「不递归删除」建议值，另立 I33。

**遗留给实施 proposal**（Claude R22，不阻塞）：§19 表中「secondary path missing → degraded mode」与「session snapshot path missing → 阻止 Agent 恢复」两行相邻但主语不同（Workspace 能否打开 vs 既有 Session 能否恢复 Agent）。二者不矛盾，但表格无列区分主语，易被读成冲突；建议为这类行标注作用对象。

### I32 · §7 apply/archive run 存储表遗漏固定 `worktreePath`

**README**：§7.1 / §11.3 · run target snapshot

§7.1 存储矩阵的 apply/archive run 行修正为 **run meta 内固定 `folderId + worktreePath`**，与 §11.3 一致。这是 I19 的横向漏同步，不是新的行为选择——I19 在 R15 收敛时只改了 §11，§7.1 作为描述同一事实的另一处未同步。

---

## I. Workspace 删除与恢复（R22–R24）

### I33 · Workspace 删除继承了已被 multi-root 废除的可恢复性前提

**README**：§6.1 / §7.1 / §8.1 / §17.3 / §19 · tombstone 删除

**前提**：旧 project 删除只移除 meta 是**可恢复**的——app-data 目录名由路径派生（F43），重开同一文件夹即可找回数据。multi-root 把数据键换成不透明 `workspaceId`（§7.1）且禁止路径派生 ID（§5.3），Workspace 又无对应磁盘目录，该恢复路径不复存在。沿用「不递归删除」会同时失去收益、保留成本。

**Fio 裁决（R22）**：改为 Workspace meta 上的 soft delete 标记。

1. **Schema**：`WorkspaceMeta` 增加 `isDeleted`、`deletedAt?`、`cleanupState?: "restorable" | "purging" | "cleanup-failed"`。**`isDeleted === false` 时不得保留 deletion fields；为 `true` 时必须有 `deletedAt` 与 `cleanupState`。**
2. **Soft delete**：先关闭窗口并取消全部 Workspace runtime（无法安全停止时拒绝删除），再原子写入 tombstone，保留原 `workspaceId`、成员关系与全部 Workspace-owned app-data。
3. **恢复**：launcher 默认列表排除 tombstone，但提供**始终可达**的「已删除的 Workspace」次级管理视图。**只有 `restorable` 可恢复**；恢复保留原 ID 与数据、清除 deletion fields，并重新执行 invariants 与 §8.3 missing-path 检查。按路径打开 tombstoned Folder Workspace 只提示恢复，不静默恢复也不创建副本。
4. **终态清理**：v1 **不自动过期、不后台 GC**；只由用户在该视图显式「永久删除」触发并二次确认。流程为持久化 `purging` → 删除 Workspace-owned 数据与 window state → 移除 meta；失败标记 `cleanup-failed`，报告失败对象并只允许重试，不伪报成功。**`purging` / `cleanup-failed` 在重启后只提供继续或重试，不提供恢复**——避免把已部分删除的数据重新开放为正常 Workspace。
5. **清理边界**：soft delete、恢复与永久清理按 `workspaceId` 串行化。清理范围**严格限于** Workspace meta、`<appData>/workspaces/<workspaceId>/**` 与 `<appData>/window-state/workspaces/<workspaceId>.json`。不得触碰 `FolderMeta`、canonical reverse index、其他 Workspace、repository worktree 或 `<appData>/workspace-folders/<folderId>/**`；**即使该 Workspace 是某 Folder 的最后一个引用，Folder 生命周期也不由 Workspace 删除隐式决定**（保留 `folderId` 即保留用户重新添加同一路径时的稳定身份，与本议题的可恢复性论证同源）。
6. **迁移**：legacy Project meta 迁移为 `isDeleted: false` 且无 deletion fields；只有孤儿 app-data、没有 meta 的 legacy 目录不扫描、不认领、不删除，留给独立 maintenance proposal。

**附带结清**（Claude R22 在 I31 下的遗留点）：§19 已给错误行标注作用对象，`Workspace open · primary path missing` 与 `Session activation` 系列不再可能被读成冲突。

**后续**：R24 复核本议题时发现 I34（§7.2 的 I1 漏同步污染 app-data 源定位）与 I35（永久删除范围与 §20.4 legacy 保留策略的交界），见 `review.md` §3。

---

## J. 迁移 source provenance 与 retained copy 清理（R24–R26）

### I34 · §7.2 的 I1 失效前提污染 §20.3 的 app-data 源定位

**README**：§7.2 / §20.3 · 迁移 source provenance

**背景**：§7.2 原把「Project id 就是 encoded path」当作事实陈述，而这是 I1 已证伪的前提。它导致 §20.3 的 app-data 源写成 `<appData>/projects/<id>`，对 path 更新过的记录指向被遗弃的旧目录（F43、F44）。

1. **legacy identity 与 app-data source key 完全拆开**：保留 `legacyProject.id` 只为身份稳定，与该 ID 是否等于 `encodeProjectPath(legacyProject.path)` 无关；**新运行期不得用两者的等式作为身份或存储前提**。
2. **cutover source key 固定为 `encodeProjectPath(legacyProject.path)`**，不得用 `legacyProject.id` 代替；App-data 只读取 `<appData>/projects/<legacyAppDataKey>`。
3. **该 key 在 cutover 时持久化为 `WorkspaceMeta.legacyAppDataKey`**（而非每次用时重算）。后续 source cleanup 只消费该 provenance，**不从 legacy ID、迁移后的 Folder 当前 path 或磁盘候选目录反推**——Folder 可能已重定位，重算会得到不同答案。这与 I19 固定 `ResolvedProposalTarget`、I12 固定 Session snapshot 是同一手法：把时点事实固化成记录。
4. **`legacyAppDataKey` 不是 Workspace identity 也不是当前 Folder path**；fresh Workspace 不设置；批量 legacy cleanup 成功删除对应 source/record 后必须清除。因此不违反 §5.3 的「路径不是 ID 的派生规则」。
5. **path 更新留下的历史目录保持 orphan**：不迁移、不回退、不合并，即使其名称恰好等于 `legacyProject.id`——旧 path 可能已被其他 Project 复用。
6. **§23 覆盖**：双目录 fixture（`<projects>/<id>` 放陈旧数据、`<projects>/<encodeProjectPath(meta.path)>` 放 active 数据），cutover 后只迁移后者且 session/task/knowledge 完整可读。

### I35 · 永久删除不覆盖 legacy app-data 副本

**README**：§7.1 / §17.3 / §20.4 · retained copy 清理

**背景**：cutover 是复制而非移动，legacy 数据默认保留到后续版本（§20.4）。I33 引入的「永久删除，不可恢复」在保留期内并不删除这份完整副本。

**方案选择**：在「扩展清理范围 / 调整承诺文案 / 收窄触发条件」三者中采用**扩展清理范围**——方案 2 会让永久删除变成需要解释保留期的半承诺，方案 3 会让迁移用户在整个保留期内失去该能力。

1. **单 Workspace 永久删除是 §20.4 默认保留策略的显式例外**：删除 Workspace meta 前，Main 用该 meta 持久化的 `legacyAppDataKey` 删除 `<appData>/projects/<legacyAppDataKey>`，并按稳定 legacy ID 删除对应 legacy Project meta record。
2. **不得改用 Workspace ID 作目录 key、当前 Folder path 或磁盘扫描改选 source。**
3. **任一 current/legacy 清理失败均保持 `cleanup-failed`**，不宣告成功；更晚的批量 cleanup migration 已清除 provenance 时幂等 no-op。
4. **`legacyAppDataKey` 存在与否本身即状态机**：字段存在就是「仍需处理 retained copy」的权威 provenance，批量清理删除 source/record 后清除该字段。因此批量清理与用户永久删除两条路径天然幂等，无需额外去重记录。
5. **文案边界**：「不可恢复」表示当前 Workspace 及其**可唯一归属**的 retained legacy copy 已清除，**不承诺法证擦除**，也不认领无法安全归属的历史孤儿目录。
6. **无法归属的 legacy orphan 不属于单 Workspace 永久删除范围**：既不因名称等于旧 ID 而删除，也不阻止已归属数据的永久清理。

**已知缺口**：第 5 点依赖的「可唯一归属」在 `encodeProjectPath` 下不被保证（F45）——已由 I36 闭合。

### I36 · `legacyAppDataKey` 的唯一归属在有损编码下不被保证

**README**：§7.2 / §19 / §20.3 / §20.4 · candidate key 唯一性

**背景**：I35 的清理与文案依赖 `legacyAppDataKey` 可唯一归属，但 `encodeProjectPath()` 把所有路径分隔符替换为 `-`，是有损变换——`/Users/tao/work/my-app` 与 `/Users/tao/work/my/app` 得到同一个 key（F45）。I1 的碰撞规则只覆盖 canonical path 相同的情形。

1. **术语拆分**：`candidateLegacyAppDataKey` 是 cutover 按 `encodeProjectPath(legacyProject.path)` 算出的 **source locator 候选**；`legacyAppDataKey` 是通过唯一性校验后才持久化的 **provenance（所有权证明）**。两者不可混用——候选 key 不是所有权证明。
2. **唯一性校验**：cutover 必须在全部迁移候选上按候选值分组，**只有恰好命中一个 legacy Project 的候选值才可持久化**为 `WorkspaceMeta.legacyAppDataKey`。
3. **碰撞组处理**：编码碰撞组各自按既有 source 正常完成 cutover（数据不丢），但**都不持久化 provenance**，共享 legacy source 作为无法安全归属的 legacy orphan 保留。
4. **两类碰撞区分**：编码后碰撞 ≠ canonical path 碰撞。前者允许 cutover 完成但不建立 provenance；后者仍按 I1 原子失败。
5. **永久清理**：无 provenance 时只清理 current Workspace 数据，**跳过未认领的共享 legacy source**，不把候选 key 当作所有权证明（§19 新增对应错误行）。
6. **§23 覆盖**：两路径编码碰撞 fixture（两个 Workspace 均完成 cutover、均不持久化 provenance、共享 source 未认领），以及「删除碰撞组之一后另一个 Workspace 不产生悬空 provenance」。

**明确排除**：编码碰撞导致两个 legacy Project 共用一个 app-data 目录、session/task 相互混入，是 multi-root 之前就存在的缺陷，按协作规则第 9 条不在本评审收敛。

---

## 评审关闭说明（R28）

I1–I36 全部收敛，评审于 R28 由 Fio 决定关闭。

**关闭理由不是「已无问题可找」。** 本评审存在实证链条：**I33（tombstone）→ I35（清理范围与 legacy 保留的交界）→ I36（provenance 唯一性）**，每层都由上一层的修复引入。修订会写入新文本，而新文本从未被审过，该过程原则上没有不动点。

**终止条件从设计上就是外部的**：I5（R5 收敛）已确立 proposal 创建后本文档失去评审用途，实现与验收以 OpenSpec 为唯一权威；规则第 7 条把最终裁量交给人类。

**支持在此停止的数据**：最近四批的阻塞级产出为 0（R18 起 2/4 → 1/4 → 0/1 → 0/2 → 0/1）；I34–I36 全部集中在 §7/§20 迁移管道且均由审查上一处修复而发现，属局部审透形态。

**后续规则**：实施阶段发现设计缺口时，**只有阻塞级才重开评审轮**（编号从 I37 起，写回 `review.md`）；中/低级别一律作为实施约束进入对应 OpenSpec proposal，由 spec 与测试兜住，不重启往返。

---

## 4. 已核实事实（双方无需重复验证）

| #   | 事实                                                                                                                                                                                                                                                                                                                               | 证据                                                                                                                                                                                                                               | 核实方                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| F1  | ACP SDK 实装 0.25.1                                                                                                                                                                                                                                                                                                                | `package.json` 声明 `^0.25.0`；`node_modules/@agentclientprotocol/sdk/package.json` 为 `0.25.1`                                                                                                                                    | Claude R1             |
| F2  | `additionalDirectories` 在 `newSession`/`loadSession`/`resumeSession`/`unstable_forkSession` 均可用；`listSessions` 支持按其过滤                                                                                                                                                                                                   | `dist/acp.d.ts`                                                                                                                                                                                                                    | Claude R1             |
| F3  | `SessionCapabilities.additionalDirectories?: SessionAdditionalDirectoriesCapabilities \| null`，供应 `{}` 即表示支持 —— **门控必须用 `!= null`，truthy 判断会把 `{}` 误判为不支持**                                                                                                                                                | `dist/schema/types.gen.d.ts:4160-4201`                                                                                                                                                                                             | Claude R1             |
| F4  | 迁移 runner：失败不重试、失败后继续执行后续迁移、不把错误抛给 bootstrap                                                                                                                                                                                                                                                            | `src/main/migrations/runner.ts` 的 `shouldSkip()` 与 catch 分支                                                                                                                                                                    | Claude R1             |
| F5  | fresh install 经 `projects` 目录与 `acp/installed.json` 判定，写入 `{ baselineId, executed: [] }` 后直接 return                                                                                                                                                                                                                    | `runner.ts` 的 `isNewInstall` 分支                                                                                                                                                                                                 | Claude R1             |
| F6  | `ProjectMeta.id` 由 `encodeProjectPath(path)` 生成；`updateProject()` 可改 path 而保持 id；`adoptExistingFolder()` 用 `encodeProjectPath()` 反查                                                                                                                                                                                   | `project-service.ts:70-83`、`:109`                                                                                                                                                                                                 | Claude R1 / Codex R2  |
| F7  | **`src/` 中不存在** `requestSingleInstanceLock` 或 `second-instance`                                                                                                                                                                                                                                                               | 全仓 grep                                                                                                                                                                                                                          | Codex R2 / Claude R3  |
| F8  | bootstrap 顺序为 `await syncShellPath()` → `await runAllMigrations()`；`app.whenReady().then(bootstrapReady)`                                                                                                                                                                                                                      | `src/main/bootstrap/index.ts:25-26`、`:56`                                                                                                                                                                                         | Codex R2 / Claude R3  |
| F9  | 迁移账本经普通 `fs.writeFile()` 覆盖写入，无文件锁、无原子 rename                                                                                                                                                                                                                                                                  | `src/main/migrations/store.ts` 的 `writeMigrationStore()`                                                                                                                                                                          | Codex R2 / Claude R3  |
| F10 | README 第 26 章影响面索引所列文件路径均存在                                                                                                                                                                                                                                                                                        | 抽查                                                                                                                                                                                                                               | Claude R1             |
| F11 | 当前窗口契约允许多个 project window 同时存在（"Project window opens another project" scenario 要求原窗口保持绑定）                                                                                                                                                                                                                 | `openspec/specs/project-window/spec.md:32-55`                                                                                                                                                                                      | Codex R4 / Claude R5  |
| F12 | 打开文件夹通过异步 `ipcMain.handle()` 进入 Main service，同一进程可接收来自不同窗口的并发请求；handler 内 `await dialog.showOpenDialog()` 显著放大竞态窗口                                                                                                                                                                         | `src/main/ipc/workspace/project.ts:49-60`                                                                                                                                                                                          | Codex R4 / Claude R5  |
| F13 | 行为契约变更（用户可见行为、IPC/preload public shape、持久化格式、用户可见默认/空/错误状态）MUST 走 OpenSpec proposal                                                                                                                                                                                                              | `guidelines/Architecture.md:49-50`                                                                                                                                                                                                 | Codex R4 / Claude R5  |
| F14 | `project-window` spec 定义了首次启动、launcher 打开、project window 打开另一项目等场景，**未定义第二个应用实例启动时的行为**                                                                                                                                                                                                       | `openspec/specs/project-window/spec.md`                                                                                                                                                                                            | Codex R4 / Claude R5  |
| F15 | bundled MCP 使用**单个** `randomBytes(32)` token，生命周期与 host 进程相同，所有 endpoint 共用；**无 per-session 隔离**                                                                                                                                                                                                            | `bundled-mcp-host.ts:295,299,330,481`；`bundled-mcp-servers.ts:29`                                                                                                                                                                 | Claude R8             |
| F16 | MCP context 经普通 base64url header 传递（`x-fyllo-project-path` 等）；`decodeContextHeader()` 只校验编码合法性与 UTF-8，**不校验来源真实性**                                                                                                                                                                                      | `src/mcp-servers/shared/request-context.ts`                                                                                                                                                                                        | Claude R8             |
| F17 | 当前 lineage index 的 `proposals`/`commitHashes` 均为 `Record<string, string>` 单值映射                                                                                                                                                                                                                                            | `lineage-store.ts:319` 的 `normalizeStringRecord()`                                                                                                                                                                                | Claude R8             |
| F18 | lineage 写入有 `withLineageWriteLock()` 按 filePath 串行化，但为**进程内**队列                                                                                                                                                                                                                                                     | `lineage-store.ts:325+`                                                                                                                                                                                                            | Claude R8             |
| F19 | 当前 bundled MCP proxy 只移除 hop-by-hop headers，其余请求 headers 原样转发；backend 只校验共享 bearer，随后直接解析 context headers                                                                                                                                                                                               | `bundled-mcp-host.ts:98-100,113-156`；`shared/http-server.ts:58-75`                                                                                                                                                                | Codex R9              |
| F20 | ACP process pool 以 `agentId` 为 key 复用 Agent 进程，同一 entry 可维护多个 active ACP Session                                                                                                                                                                                                                                     | `acp-process-pool.ts:62,382-400,480-489`                                                                                                                                                                                           | Codex R9              |
| F21 | 当前 stdio MCP spec 把独立 `process.execPath` command、bundle args 与 env 交给 Agent runtime 启动，不是 MCP server 与 Agent 的同进程模块                                                                                                                                                                                           | `bundled-mcp-servers.ts:40-58`                                                                                                                                                                                                     | Codex R9 / Claude R10 |
| F22 | lineage service 在**进入写队列之前**调用 `readWritableIndex()`；现有 `withLineageWriteLock()` 只串行化写入，读-改-写整体仍会 lost update                                                                                                                                                                                           | `lineage-service.ts:55,149,165,189,211,226,248,270,299`；`lineage-store.ts:325`                                                                                                                                                    | Codex R9 / Claude R10 |
| F23 | preview grant key 为 `${projectId}\0${canonicalPath}`，**不含 folderId**；grant 存于 `Map<webContentsId, Set<string>>`，仅 `cleanupSender()` 清除                                                                                                                                                                                  | `local-file-preview-service.ts:117-119,160,281-283,292`                                                                                                                                                                            | Claude R11            |
| F24 | `getTrustedRoots()` 只对**单个** `projectPath` 求 canonical root + `listWorktrees()`；context 仅携带 `projectPath`/`projectId`                                                                                                                                                                                                     | `local-file-preview-service.ts:34,301-305`                                                                                                                                                                                         | Claude R11            |
| F25 | attachment 本体写入 `sessionsDir(projectPath)/<sessionId>/attachments`，是 Workspace 数据目录内的**独立副本**，读取不经成员 folderPath                                                                                                                                                                                             | `attachment-store.ts:14-15,54-56,60-63`                                                                                                                                                                                            | Claude R11            |
| F26 | member/worktree trusted-root 命中时直接读取，**不会写 remembered grant**；只有外部路径确认成功且 `rememberForWindow` 为 true 时才写 grant                                                                                                                                                                                          | `local-file-preview-service.ts:183-188,191-215,280-283`；`local-file-link-preview/spec.md:111-170`                                                                                                                                 | Codex R12             |
| F27 | public preview IPC input 只含 `requestedPath`，或 `authorizationId + rememberForWindow`；project identity 由 handler 从 sender context 取得，`LocalFilePreviewContext` 是 Main 内部 service shape                                                                                                                                  | `workspace/document.schemas.ts:3-14`；`main/ipc/workspace/document.ts:27-67`                                                                                                                                                       | Codex R12             |
| F28 | 当前 attachment image 读取接受 renderer 提交的 `file://` URI，并直接 `fileURLToPath()` 读取；URI 尚不是 Workspace/Session-scoped opaque handle                                                                                                                                                                                     | `session/chat.schemas.ts:127-141`；`main/ipc/session/chat.ts:194-198`；`attachment-store.ts:54-56`                                                                                                                                 | Codex R12             |
| F29 | apply/archive 分别以 owner worktree 作为 `cwd` 创建 `AcpSession`，但 bundled MCP spec 由独立的 `AcpSession.projectPath` 生成；文件系统 scope 与 MCP context 是两条构造链                                                                                                                                                           | `main/ipc/proposal/apply.ts:87-99`；`main/ipc/proposal/archive.ts:115-126`；`session/chat/acp-session.ts:161-164`                                                                                                                  | Codex R14             |
| F30 | 当前 apply/archive 用 caller `targetPath` 表示实际 worktree；apply 校验 registered worktree + change 目录，archive 再以 `getProjectPath()` 作为 main path 完成 finalization                                                                                                                                                        | `fyllo-specs/src/tools/apply-change.ts:34-47`；`archive-change.ts:128-145,223-228`；`utils/project-root.ts:29-72`                                                                                                                  | Codex R14             |
| F31 | 当前 explore 按名称选择 `activeChanges.find()` 的第一项，未命中时回退 main root；worktree 聚合以 `seenNames` 去重并让 linked 优先                                                                                                                                                                                                  | `fyllo-specs/src/tools/explore.ts:40-55`；`runtime-openspec/list-workspace-changes.ts:13-33`                                                                                                                                       | Codex R14             |
| F32 | 当前 `fyllo-specs` 用 `workspacePath/workspaceMode` 表示 Git worktree，并在 instruction 中让 agent 把 `state.workspace.path` 继续作为 `targetPath`                                                                                                                                                                                 | `runtime-openspec/types.ts:9-12`；`runtime-workspace/types.ts:1-15`；`tools/instructions/explore.md:112-118`                                                                                                                       | Codex R14             |
| F33 | Specs browser 在目录读取失败时返回空 items、单文件任意读取错误时丢弃该 item；Overview 的 specs/archive/guidelines count 在任意错误时返回 0，leaf reader 无法向 aggregate 区分 empty 与 failure                                                                                                                                     | `specs-browser-service.ts:11-24,31-50`；`overview/openspec-stats.ts:15-47`                                                                                                                                                         | Codex R16             |
| F34 | `getProjectOverview(projectPath)` 同时读取 repository counts/Git/proposals 与 project app-data 中的 subjects/recent lineage；active proposal enrichment 也用同一 projectPath 查 lineage                                                                                                                                            | `overview-service.ts:31-55,58-70,99-189,213-244`                                                                                                                                                                                   | Codex R16             |
| F35 | Proposal/Specs/Guidelines renderer 页面分别只用 `proposal.id`、`spec.id`、guideline relative `path` 作为 Vue key 与 selection/detail identity；Overview active change 与 detail slideover 也只传 `changeId`                                                                                                                        | `pages/proposal.vue:28-30,79-86`；`pages/specs.vue:13-23,69-79,110-125`；`pages/guidelines.vue:13-30,46-57,104-119`；`components/overview/OverviewActiveChanges.vue:24-25,49-57`；`composables/useProposalDetailSlideover.ts:4-15` | Codex R16             |
| F36 | `SystemReminderContext` 只有 `projectPath`；模板变量白名单仅含 `changeId/stageIndex/runId/projectPath/worktreePath/mainProjectPath/taskRef/taskTitle`，无成员集合                                                                                                                                                                  | `system-reminder/types.ts:6`；`providers/shared.ts:6-16,54-59`                                                                                                                                                                     | Claude R18            |
| F37 | reminder 现有防护为 `escapeAngleBrackets()`（转义 `<`/`>`）+ 变量白名单；仅覆盖固定标量，无结构化列表注入场景                                                                                                                                                                                                                      | `providers/shared.ts:19-20,40`                                                                                                                                                                                                     | Claude R18            |
| F38 | `requiresProject` 不只在 route meta：`activity-bar.ts:7` 定义该字段并在多个配置项使用，是导航门控的第二个消费者                                                                                                                                                                                                                    | `renderer/src/config/activity-bar.ts:7,18,27,35,43`                                                                                                                                                                                | Claude R18            |
| F39 | `TaskItem` 当前含 `projectId: string`；task 数据按 `encodeProjectPath(projectPath)` 定位                                                                                                                                                                                                                                           | `shared/types/task.ts:49`；`task-store.ts:62-63`                                                                                                                                                                                   | Claude R18            |
| F40 | **system reminder 只在创建全新 ACP session 时注入，不是每轮重新生成**：`resolveReminderParts()` 在 `createdNewSession` 为 false 时直接返回空数组，注释明确 resumed/loaded session 不重复注入。因此「reminder 注入」与「activation 创建」是同一时点                                                                                 | `main/services/session/chat/acp-session.ts:579-591`                                                                                                                                                                                | Claude R20            |
| F41 | `guidelines/RendererProcess.md` 仍记录 legacy 契约「MUST 使用 `ActivityBarItem.requiresProject` 表达项目门控导航」；README §22 拆分建议与 §23 覆盖清单均未把该 guideline 的同步更新列为交付物                                                                                                                                      | `guidelines/RendererProcess.md:21`；README §22 全文 grep 无 `RendererProcess`                                                                                                                                                      | Claude R20            |
| F42 | **现有 project 删除只移除 meta，不触碰 app-data**：`removeProject(id)` 仅调用 `deleteProjectStore(id)`                                                                                                                                                                                                                             | `main/services/workspace/project/project-service.ts:86-88`；`main/infra/storage/project-store.ts:106`                                                                                                                              | Claude R22            |
| F43 | **project app-data 目录名由路径派生而非 project id 派生**：`projectDir(projectPath)` = `data/projects/<encodeProjectPath(projectPath)>`。重新打开同一文件夹会算出同一目录名，删除后的数据可被找回——这是「保守不删除」成立的前提；multi-root 的 `<appData>/workspaces/<workspaceId>/**`（§7.1）与 §5.3 禁止路径派生 ID 使该前提失效 | `main/infra/storage/project-paths.ts:25-36`；README §7.1、§5.3                                                                                                                                                                     | Claude R22            |
| F44 | **`updateProject()` 允许修改 `path` 而保持 `id` 不变，且不搬迁任何 app-data 目录**；配合 F43（目录名按调用时的当前 path 计算），path 更新后活数据写入 `projects/<encodeProjectPath(新 path)>`，旧目录成为孤儿，而 `id` 仍等于 `encodeProjectPath(创建时的 path)`。因此 `<appData>/projects/<id>` 对这类记录指向被遗弃的旧目录      | `main/services/workspace/project/project-service.ts:64-83`；`project-paths.ts:34-36`                                                                                                                                               | Claude R24            |
| F45 | **`encodeProjectPath()` 是有损变换，不同 canonical path 可得到相同 key**：它把所有 `/` 与 `\` 替换为 `-`，因此 `/Users/tao/work/my-app` 与 `/Users/tao/work/my/app` 同为 `Users-tao-work-my-app`（已运行验证）。I1 的碰撞规则只覆盖 canonical path 相同的情形，编码后碰撞不在其中                                                  | `main/infra/storage/project-paths.ts:25-31`                                                                                                                                                                                        | Claude R26            |

---

---

## 5. 双方一致认可的设计决策

以下决策论证扎实，双方无异议，应在后续 proposal 中保留：

- **`kind` 持久化而非按 Folder 数量推导**（README §6.1）。README 第 208 行指出的「用户再次打开原文件夹时只能新建另一个 Workspace，原有 session 看似丢失」是真实的产品陷阱，五条否决理由完整。
- **能力门控按运行期 `additionalDirectories` 是否非空，而非按 Workspace kind**（README §9.1）。使单 Folder 的 Collection Workspace 与 degraded 状态仍可使用不支持该 capability 的 Agent，避免无谓的兼容性收窄。
- **v1 单 owner repository + `ProposalRef{folderId, changeId}`**（README §11）。正确识别跨仓库原子提交的复杂度并划清 v1 边界；§9.4 关于 apply/archive 不下发其他成员可写目录的理由充分。
- **MCP 只接受 `folderId`、不接受任意绝对路径**（README §10.4）。安全模型正确；R9 已进一步固定为 per-activation opaque capability，不再保留签名 claim 分支。
- **§20 对迁移框架现实的对齐**。明确否定了「幂等重试」「失败后自动回滚」等不存在的框架能力，避免基于错误前提的设计。

---
