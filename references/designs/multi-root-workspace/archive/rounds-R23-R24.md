# Multi-root Workspace 设计评审 · 往返历史存档（R23–R24）

**承接**：`rounds-R21-R22.md`（I29–I32）
**本档范围**：I33 的完整往返（R22 Fio 裁决提出 → R23 Codex 修订 → R24 Claude 复核收敛）
**有效结论**：只在 `decisions.md`。

> R24 复核 I33 期间新发现 I34、I35，见 `review.md` §3。

---

## I33 · Workspace 删除的「不递归删除 app-data」继承自已被 multi-root 废除的前提

**级别**：高 | **收敛**：R24 | **提出**：R22 · Fio（人类裁决 I31 第 2 项时提出）

### 问题陈述

§17.3 与原 §25.2 第 2 项把「Workspace 删除默认不递归删除 app-data」表述为「与现有保守删除语义一致」。**该表述继承了行为，但没有继承它成立的前提。**

现有行为之所以保守，是因为它**可恢复**：

- `removeProject(id)` 只调用 `deleteProjectStore(id)`，仅移除 meta，不触碰 app-data（`project-service.ts:86-88`，F42）；
- project app-data 位于 `data/projects/<encodeProjectPath(projectPath)>/`，**目录名由路径派生，不由 project id 派生**（`project-paths.ts:25-36`，F43）；
- 因此用户重新打开同一文件夹时会算出同一目录名，meta 重建后原有 session/task/knowledge 直接找回。保留数据是一条真实的恢复路径，不是垃圾。

multi-root 废除了这个前提：Workspace app-data 改为 `<appData>/workspaces/<workspaceId>/**`（§7.1），键是不透明的 `workspaceId`；§5.3 禁止新运行期通过路径编码计算或恢复已有 ID；Workspace 是虚拟结构，没有对应的用户磁盘目录，用户没有任何动作能重新生成同一个 `workspaceId`。

结果是该策略在新模型下**同时失去收益、保留成本**：数据永久不可达，只剩磁盘增长与孤儿目录。它不是保守，是泄漏。

### 往返记录

**[R22] Fio（人类裁决）：** 之前 project 的删除只移除 project meta 文件，是因为用户后期再打开这个 project 时，内部数据未做移除，而且由于 project id 是 encoded path，可以直接在已有目录中创建 project meta，之后用户可以直接「找回」之前的数据。Workspace 由于没有稳定的用户磁盘目录，只是一个 FylloCode 的虚拟结构，**建议给 Workspace meta 增加 `isDeleted` 标记**。

**[R22] Claude：** 已核实三处代码事实（F42、F43），前提失效成立。要求 Codex 按 soft delete 方向修订 §17.3 与 §25，并明确六点：删除改为标记而非移除 meta；恢复入口必须可达；终态清理的触发者与时机；与共享 Folder 的隔离；与迁移遗留孤儿目录的关系；§19/§23 的边界行与覆盖。

**[R23] Codex：** 接受 I33 与 Fio 的 soft-delete 方向，并补齐六点：

1. `WorkspaceMeta` 增加 `isDeleted`、`deletedAt` 与 `cleanupState: restorable | purging | cleanup-failed`；soft delete 在关闭窗口、取消 runtime 后保留原 ID、成员与 app-data，写入可恢复 tombstone（`README.md:175-205`、`:1303-1327`）。
2. launcher 默认隐藏 tombstone，但提供始终可达的「已删除的 Workspace」管理视图。只有 `restorable` 可恢复；恢复保留原 `workspaceId` 与数据并重新执行 invariants/missing-path 检查。按路径打开 tombstoned Folder Workspace 只提示恢复，不静默恢复或创建副本（`README.md:410-425`）。
3. v1 明确不自动过期、不后台 GC；终态清理只由用户显式「永久删除」触发并二次确认。清理先持久化 `purging`，删除 Workspace-owned 数据/window state，最后删 meta；失败标记 `cleanup-failed` 并只允许重试（`README.md:1323-1327`、`:1396-1399`）。
4. soft delete、恢复与永久清理均按 `workspaceId` 串行化；清理范围只含 Workspace meta、`<appData>/workspaces/<workspaceId>/**` 与该 Workspace window state。Folder registry、canonical reverse index、其他 Workspace、worktree 和 `<appData>/workspace-folders/<folderId>/**` 全部不受影响，即使这是 Folder 的最后一个 Workspace 引用（`README.md:325-345`、`:1326-1327`）。
5. legacy Project meta 迁移为 `isDeleted: false`；只有孤儿 app-data、没有 meta 的 legacy 目录不扫描、不认领、不删除，留给独立 maintenance proposal（`README.md:1474-1485`）。
6. §19 已增加删除/恢复/清理边界，并给 Workspace open 与 Session activation 的 missing 行标注作用对象；§23/§24 已覆盖 schema、迁移、launcher、恢复、清理失败、共享 Folder 隔离与验收；§25 已移除待确认小节（`README.md:1387-1427`、`:1665-1708`、`:1794-1798`、`:1826-1833`、`:1872-1897`）。

**[R24] Claude：** **接受，六点全部落地，收敛。**

逐条核实：schema 三字段与「`isDeleted === false` 时不得保留 deletion fields」的完整性约束（`README.md:175-187`、`:205`）；launcher 「始终可达的次级管理视图」及恢复/永久删除两个操作（`:410-425`）；不自动 GC 与显式二次确认（`:1325`）；清理边界枚举（`:1327`、§7.1:345）；legacy 孤儿目录不扫描不认领不删除（`:1485`）；§19 新增四行删除/恢复/清理边界（`:1396-1399`）。

**三点值得肯定：**

1. **`cleanupState` 三态解决了我没提但真实存在的崩溃窗口。** 我在 R22 只要求「定义终态清理」，没要求区分「清理失败」与「清理中断」。§17.3:1326 明确 `purging` / `cleanup-failed` **在重启后只提供继续或重试，不提供恢复** —— 这挡住了「app 在删了一半数据后崩溃，重启时用户点恢复，得到一个静默残缺的 Workspace」这条路径。这是比我要求的更严格的设计。
2. **`isDeleted === false` 时禁止保留 deletion fields**（`:205`）。这条防止了 tombstone 字段在恢复后残留成为幽灵状态，是 schema 层的完整性约束而不只是流程约定。
3. **Folder 生命周期不由 Workspace 删除隐式决定**（`:1327`），即使这是最后一个引用。保留 Folder 与 `folderId` 恰好保留了「用户重新添加同一路径时拿回稳定身份」的能力 —— 这与 I33 最初的可恢复性论证同源，方向一致。

**§19 的主语标注同时结清了我 R22 在 I31 下留的遗留点**：`Workspace open · primary path missing` 与 `Session activation` 系列现在前缀区分作用对象（`:1405-1406`），不会再被读成冲突。

**复核期间发现两处新问题，另立 I34、I35，不影响本议题收敛**：I34 是 §7.2 仍保留 I1 已证伪的前提并导致 §20.3 的 app-data 源定位在特定存量记录上指向陈旧目录；I35 是本轮新增的永久清理范围与 §20.4 的 legacy 保留策略叠加后，「永久删除」在保留期内并不删除全部用户数据。

**共识结论**见 `decisions.md` I33。
