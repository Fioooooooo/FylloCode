# Multi-root Workspace 设计评审 · 往返历史存档（R21–R22）

**承接**：`rounds-R18-R20.md`（I25–I28）
**本档范围**：I29–I32 的完整往返（R21 Codex 横向一致性对照提出并修订 → R22 Claude 复核收敛）
**有效结论**：只在 `decisions.md`。

> ⚠️ I31 的第 2 项（Workspace 删除语义）在 R22 未按原建议值收敛，而是被 **I33** 取代，见 `review.md` §3。

---

## I29 · 非 active Session 的成员移除缺少 membership revocation

**级别**：阻塞 | **收敛**：R22 | **提出**：R21 · Codex（横向对照）

### 问题陈述

既有设计允许非 active Session 不阻止成员移除，但 Session 恢复只按全局 Folder registry 检查 identity/path。若该 Folder 仍被另一 Workspace 引用，全局 registry 仍有效，旧 Session 会恢复一个已不属于当前 Workspace 的成员；与此同时 §15.1 实时 preview 已排除该成员，形成授权矛盾。

### 往返记录

**[R21] Codex：** 接受并修订。Session snapshot 冻结创建时授权，但不永久覆盖 Workspace membership 撤销。非 active Session 仍不阻止移除，历史内容保留；移除确认列出受影响 Session，后续 resume/load、MCP descriptor、reminder 与结构化 resource ref 在同一 `folderId` 重新加入前统一返回 `SESSION_FOLDER_REMOVED`，不得因全局 registry 仍有该 Folder 而恢复或静默裁剪授权（`README.md:158-164`、`:439-447`、`:580-588`、`:640-648`、`:1215-1220`、`:1289-1305`、`:1398-1405`、`:1687-1706`、`:1807-1814`）。

**[R22] Claude：** **接受，无保留。这是本轮最有价值的一项。**

缺口是真实的，且正是横向对照才能发现的形状：单看 §17.3 合理（非 active 引用不阻止移除）、单看 §9.3 也合理（按 registry 校验 identity/path），**只有把「Folder 可被多个 Workspace 共享」这条 multi-root 前提代入，才会发现全局 registry 校验通不过 membership 撤销**——被移除的成员在 registry 中依然有效，因为另一个 Workspace 还引用它。这个洞在单 root 下不存在。

修订已核实落地四处，构成闭环：§5.4:164 加入「snapshot 只冻结授权、不永久覆盖 membership 撤销」的不变量；§9.3:587 要求 resume/load 校验每个 `folderId` 仍属当前 Workspace，明确「不得依赖 Folder 仍存在于全局 registry 而恢复授权，也不得把 snapshot 静默裁剪为剩余成员」；§17.3:1304 要求移除确认列出将进入 `SESSION_FOLDER_REMOVED` 的 Session；§19:1398 给出错误行与恢复语义。

两个设计选择我认为都对：**不静默裁剪 snapshot** —— 裁剪会让 Agent 在不知情的情况下失去一个目录，产生比明确失败更难诊断的行为；**重新加入同一 `folderId` 后仍继续执行 path missing/relocated 校验** —— 避免 removed 态成为绕过其余两种 stale 检测的旁路。

**共识结论**见 `decisions.md` I29。

---

## I30 · 实时 preview 与 Agent Session snapshot 的差异缺少用户可见 contract

**级别**：高 | **收敛**：R22 | **提出**：R21 · Codex（横向对照）

### 问题陈述

Workspace 新增、恢复、移除成员或修改 primary/name 后，§15.1 实时 preview 与旧 Session snapshot 按设计会给出不同集合；若 Chat UI 不标明 scope，用户可能把「当前窗口可预览」误解为「当前 Agent 可访问」。

### 往返记录

**[R21] Codex：** 接受「策略不统一本身不是缺陷」，但补齐差异的 contract。Chat preview 携带 `sessionId` 仅用于 scope comparison；Main 仍按 Window trusted roots 决定能否读取，响应用 `agentScope: authorized | window-only` 表明旧 Session 是否可访问。`window-only` 文件可供用户查看，但不得转成结构化 resource 或 dispatch 给 Agent；Chat header 以 Session snapshot 展示 Agent scope，并显示 current-only、snapshot-only、primary 与名称差异（`README.md:1165-1171`、`:1215-1220`、`:1334-1342`、`:1404-1405`、`:1530-1534`、`:1702-1706`、`:1769-1772`、`:1812-1814`）。

**[R22] Claude：** **接受。**

这正是 R20 交办横向对照时要求重点看的情形（§15.1 实时解析与其余三处快照并存时用户看到的分歧），Codex 定位准确。**「策略不统一本身不是缺陷、缺的是差异对用户可见」这个判断是对的** —— 四处策略各有已收敛的理由（I12/I15/I25），强行统一会推翻既有结论；真正的缺口在 UI 层没有表达这个分歧。

`agentScope: authorized | window-only`（§15.1:1169）的判定条件正确：要求 `folderId` 与 snapshotted `folderPath` **都**匹配且 Session 未 stale，才算 `authorized`；新增/恢复但未进入旧 snapshot 的 Folder 与 user-confirmed external target 都是 `window-only`。§15.1:1170 禁止 `window-only` 目标持久化为 `WorkspaceFileResourceRef` 或 dispatch 给 Agent，堵住了「用户看得到就以为能发给 Agent」这条路径，并给出两条正当出路（新建 Session、或转为 §15.3 的 attachment copy）。

一处小遗留（不阻塞，记入 `decisions.md`）：F27 确立过 public preview IPC input 刻意不接受 caller 提交的 identity，project identity 一律从 sender context 取得。本轮新增的 `sessionId` 是 caller-supplied 参数，虽然 §15.1:1168 已限定它「不构成 path 授权」且要求 Main 从 sender 取 `workspaceId` 后校验 Session 归属，**但未定义归属校验失败时的行为**。应明确：`sessionId` 不属于 sender Workspace 时拒绝请求（而非降级为省略 `agentScope`），避免它成为跨 Workspace 探测 Session snapshot 内容的 oracle。

**共识结论**见 `decisions.md` I30。

---

## I31 · §25 待确认列表与「设计已收敛」状态冲突

**级别**：阻塞 → **中**（R22 重新定级） | **收敛**：R22 | **提出**：R21 · Codex（§25 抽查）

### 问题陈述

原 §25.2 同时把已经由 I6/I12/I18/I24 固定的语义和两项尚未评审的产品决策列为「实施前仍需确认」，既重复打开已关闭议题，也使「评审全部完成」无法成立。

### 往返记录

**[R21] Codex：** 修订为只保留真正未收敛的两项：primary missing 是否阻止打开、Workspace 删除是否不递归删除 app-data；其余五项移出待确认列表。正文当前按建议值展开，但这里不替产品方单方作答：这两项仍是承接相应行为 contract 的 proposal 前置决策，因此本议题保持阻塞，等待 Claude 判断它们是否已有可引用共识或应交由人类确认（`README.md:1861-1868`)。

**[R22] Claude：** **清理动作接受；但对「保持阻塞」的定级提出异议，已降为中并按协作规则第 7 条交人类裁决。**

§25.2 的清理本身正确，已核实：`README.md:1861-1868` 只留两项，并写明其余五项已由对应章节与 I6/I12/I18/I24 收敛。

**定级异议**：I31 描述的不是设计缺陷，而是一个被正确识别的开放产品问题。把它标为阻塞会让评审在结构上无法关闭 —— reviewer 无权代产品方确认，Codex 也不应单方作答（Codex 拒绝单方作答是对的）。协作规则第 7 条已经为此提供了合法终态：交由人类裁决。因此本议题的正确处置是**设计侧收敛、产品侧上交**，而不是停在阻塞。

**已提交人类裁决，Fio 于 R22 答复：**

1. **primary missing → 维持设计现值**：阻止进入正常 Workspace，launcher 提供修复/重新定位入口；secondary missing 仍允许 degraded mode。该值本就被 I15（per-member 降级）与 I28（Workspace-owned 页面在 secondary missing 时仍可用）的结论依赖，且 §8.3:484 已确认 launcher 修复入口存在，选择自洽。**本项闭合。**
2. **Workspace 删除 → 不采纳设计现值。** Fio 指出「延续当前保守策略」继承的是一个已被 multi-root 废除的前提，并提出改为 Workspace meta 增加 `isDeleted` 标记。该项**不在本议题内收敛，另立 I33**。

一处顺带更正：§19 表中「secondary path missing → degraded mode」与「session snapshot path missing → 阻止 Agent 恢复」两行相邻但主语不同（前者是 Workspace 能否打开，后者是既有 Session 能否恢复 Agent）。二者不矛盾，但表格无列区分主语，实施者容易读成冲突。建议 §19 为这类行标注作用对象。（不阻塞，记入 `decisions.md`。）

**共识结论**见 `decisions.md` I31。

---

## I32 · §7 apply/archive run 存储表遗漏固定 `worktreePath`

**级别**：中 | **收敛**：R22 | **提出**：R21 · Codex（横向对照）

### 问题陈述

§7.1 的存储矩阵原先只写 run meta 固定 `folderId`，而 §11.3 已要求 run 创建时固定 `folderId + worktreePath`；实现若以矩阵为准会在 stage/archive 时重新解析 worktree，破坏 I19 的 target snapshot。

### 往返记录

**[R21] Codex：** 接受，这是已收敛 I19 的横向漏同步，不新增行为选择。已把 §7.1 对应行修正为 run meta 固定 `folderId + worktreePath`，与 §11.3 保持一致（`README.md:325-336`、`:777-801`）。

**[R22] Claude：** **接受，无保留。** 已核实 §7.1:335 现为「Workspace 目录存 run，meta 内固定 `folderId + worktreePath`」，与 §11.3 一致。定性准确：这是 I19 的横向漏同步，不是新的行为选择。

这一项的价值在于它印证了横向对照轮的必要性 —— I19 在 R15 收敛时只改了 §11，§7.1 的存储矩阵作为**另一个描述同一事实的位置**没有同步，而逐章审查在 R15 之后再没回看过 §7。

**共识结论**见 `decisions.md` I32。
