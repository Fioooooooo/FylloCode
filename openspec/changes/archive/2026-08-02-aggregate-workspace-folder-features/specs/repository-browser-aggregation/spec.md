## ADDED Requirements

### Requirement: Repository readers return a per-Folder aggregate envelope

系统 SHALL 让当前 Workspace 的 repository-owned browser 以完整成员集合为输入，并为每个 Folder 返回一个 owner-qualified result。每个 result SHALL 包含 `folderId`、`folderName`、`folderPath`、primary 标记、`ready | missing | error` 状态、items 与 item warnings；aggregate SHALL 包含稳定排序的 Folder results、扁平 items、`complete | partial` completeness 和未计入的 Folder IDs。

#### Scenario: Ready Folder has no items

- **WHEN** 一个可用 Folder 的目标 repository 目录合法存在但没有可读对象
- **THEN** 该 Folder result SHALL 为 `ready` 且 items 为空
- **AND** aggregate SHALL NOT 把合法空数据标记为 missing 或 error

#### Scenario: Missing Folder remains visible

- **WHEN** Workspace resolver 将一个成员 Folder 标记为 path missing
- **THEN** aggregate SHALL 为该 Folder 返回 `missing`
- **AND** SHALL 保留该 Folder 的稳定 identity 和最后已知 path
- **AND** SHALL NOT 因其他 Folder 可读而隐藏该 missing member

#### Scenario: One Folder reader fails

- **WHEN** 一个可用 Folder 因 permission、I/O、Git 或顶层解析错误无法完成读取，而其他 Folder 可读
- **THEN** 失败 Folder SHALL 返回 `error` 和可展示错误信息
- **AND** 其他 Folder 的 ready items SHALL 保留
- **AND** aggregate SHALL 为 `partial` 并列出未计入 Folder

#### Scenario: Item warning does not discard siblings

- **WHEN** 一个 Folder 中单个 repository item 无法读取或解析，而同 Folder 其他 items 有效
- **THEN** Folder result SHALL 保留有效 items 并附加 owner-qualified warning
- **AND** SHALL NOT 把整个 Folder 降级为空列表

### Requirement: Repository aggregate identity and filtering preserve owner

系统 SHALL 让 repository-local object 的完整 identity 包含 `folderId`，并让 renderer 的 list key、selection、detail lookup、IPC request 和 cache 使用该 identity。Folder filter SHALL 只改变可见集合，SHALL NOT 改写 object owner 或从裸 local ID 重新推导 owner。

#### Scenario: Same local ID exists in two Folders

- **WHEN** 两个 Folder 返回相同 repository-local ID 或 path 的对象
- **THEN** aggregate SHALL 同时保留两个对象
- **AND** renderer SHALL 使用各自 owner-qualified key 分别选择和打开详情

#### Scenario: Filter hides selected owner

- **WHEN** 用户选择 Folder filter 后，当前选中对象不属于可见 Folder
- **THEN** 页面 SHALL 从过滤后的完整 Ref 集合选择首项或展示过滤空态
- **AND** 后续详情操作 SHALL 使用所选对象自身的 Folder owner
- **AND** SHALL NOT 将同名对象切换到当前 filter Folder

### Requirement: Aggregate consumers bind async state to Workspace

Repository aggregate request SHALL 绑定请求发起时的 `workspaceId` 与请求世代。切换 Workspace 后的迟到 response SHALL 被丢弃，不得覆盖当前 Workspace 的 items、Folder states、filter 或 selection。

#### Scenario: Previous Workspace response arrives late

- **WHEN** 用户切换 Workspace 后，前一 Workspace 的 aggregate response 才返回
- **THEN** store SHALL 忽略该 response
- **AND** 当前 Workspace 的 Folder state 与 selected Ref SHALL 保持不变
