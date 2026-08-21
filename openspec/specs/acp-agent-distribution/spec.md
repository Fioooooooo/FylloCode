# acp-agent-distribution Specification

## Purpose

定义 ACP Agent 精选目录的唯一来源、缓存来源隔离、Binary 分发摘要校验、跨平台归档解压、安装事务回滚及目录成员资格边界；本规格是 Registry Agent 获取与安装行为的主要契约。

## Requirements

### Requirement: 精选目录是唯一远端 Agent 来源

系统 SHALL 只从 `https://curated-acp-agents.onrender.com/registry.json` 获取可发现、可安装和可更新的 Registry Agent，并 SHALL NOT 查询、合并或回退到官方 ACP Registry。系统 SHALL 接受包含 `agents` 数组且带有额外顶层字段的 Registry 文档，不得因 `curation` 或其他未知顶层扩展而拒绝整份目录。

#### Scenario: 成功加载精选目录

- **WHEN** 精选目录返回包含有效 `agents` 数组和额外顶层扩展的 JSON
- **THEN** 系统返回并缓存该 `agents` 集合
- **AND** 系统不向官方 ACP Registry 发起请求

#### Scenario: 精选目录不可用且没有可用缓存

- **WHEN** 精选目录请求失败且本地不存在同一来源的可用缓存
- **THEN** 系统返回 Registry 加载失败
- **AND** 系统不使用官方 ACP Registry 补齐或替代结果

### Requirement: Registry 缓存绑定来源身份

系统 SHALL 在 Registry 缓存中持久化稳定的来源身份或规范化来源 URL，并且只有来源与当前精选目录一致的缓存才可用于前台返回或 stale-while-revalidate。缺少来源身份或标记为其他来源的历史缓存 SHALL NOT 作为精选目录返回。

#### Scenario: 旧官方缓存仍在有效期内

- **WHEN** 应用升级后读取到缺少来源身份的旧 Registry 缓存
- **THEN** 系统忽略该缓存的目录内容并请求精选目录
- **AND** 用户不会看到由旧缓存继续提供的官方 Agent 集合

#### Scenario: 精选缓存过期且刷新失败

- **WHEN** 来源匹配的精选缓存已过期且后台刷新失败
- **THEN** 系统继续返回该精选缓存并报告刷新日志
- **AND** 系统不切换到其他 Registry 来源

### Requirement: Binary SHA-256 遵循可选但严格的校验语义

系统 SHALL 将 binary distribution 的 `sha256` 视为可选字段。字段存在时，系统 MUST 在解压和替换现有安装前校验下载文件的 SHA-256；摘要格式不是 64 位十六进制或实际摘要不一致时 MUST 终止安装。字段不存在时，系统 SHALL 继续安装，但 SHALL NOT 将该下载标记或描述为已经过完整性验证。

#### Scenario: 提供的摘要匹配

- **WHEN** binary distribution 提供合法 `sha256` 且下载内容的摘要一致
- **THEN** 系统继续解压和安装

#### Scenario: 提供的摘要不匹配

- **WHEN** binary distribution 提供 `sha256` 但下载内容的摘要不一致
- **THEN** 系统在解压前终止安装并返回完整性校验失败
- **AND** 系统不写入新的 installed record 或最终安装目录
- **AND** 如果该 Agent 已有最终安装目录，系统保持其内容不变

#### Scenario: 提供的摘要格式无效

- **WHEN** binary distribution 的 `sha256` 不是 64 位十六进制
- **THEN** 系统将该 distribution 视为无效并终止安装
- **AND** 如果该 Agent 已有最终安装目录和 installed record，系统保持二者不变

#### Scenario: 上游未提供摘要

- **WHEN** binary distribution 未提供 `sha256`
- **THEN** 系统跳过摘要校验并继续安装
- **AND** 安装结果不声称具有上游摘要保证

### Requirement: Binary 归档由跨平台库解压

系统 SHALL 使用 `@xhmikosr/decompress` 11.1.4 或更高的安全修复版本解压 ZIP、TAR、TAR.GZ/TGZ 和 TAR.BZ2/TBZ2，不得要求宿主系统预装 `unzip`、`tar` 或 7-Zip。系统 MUST 在独立临时目录中解压，并在校验成功后把结果复制到最终目录同父级的 staging 目录，再通过同文件系统 rename 提交；installed record MUST 通过同父级临时文件和 rename 原子写入。损坏、无法识别或不受支持的归档 MUST 终止安装，不得被静默复制为普通二进制。

#### Scenario: 安装 Goose TAR.BZ2 分发

- **WHEN** 当前平台的精选 manifest 指向有效的 Goose `.tar.bz2` 归档
- **THEN** 系统无需调用系统 `tar` 或 `bzip2` 即可完成解压
- **AND** 系统从解压树中解析 manifest 声明的可执行文件

#### Scenario: 安装 ZIP 或 TAR.GZ 分发

- **WHEN** 当前平台的精选 manifest 指向有效 ZIP、TAR、TAR.GZ 或 TGZ 归档
- **THEN** 系统通过同一跨平台解压适配层完成解压

#### Scenario: 归档损坏或格式不受支持

- **WHEN** 下载内容无法由受支持的解压插件识别或完整解析
- **THEN** 系统终止安装并清理临时文件
- **AND** 系统不把下载文件复制进最终安装目录
- **AND** 如果该 Agent 已有最终安装目录，系统保持其内容不变

#### Scenario: 替换已有安装时提交或记录写入失败

- **WHEN** 新归档已通过校验和解压，但 staging 准备、最终目录 rename、权限处理或 installed record 写入失败
- **THEN** 系统删除未完成的新目录并恢复提交前的已有安装目录
- **AND** 系统保留提交前的 installed record
- **AND** 系统清理 staging 与 backup 临时目录

#### Scenario: 首次安装提交失败

- **WHEN** Agent 没有已有正式安装，但 staging 准备、最终目录 rename、权限处理或 installed record 写入失败
- **THEN** 系统清理 staging 与未完成的新正式目录
- **AND** 系统不创建 installed record

### Requirement: 解压结果的 Buffer 引用在写盘后主动解除

系统 SHALL 通过项目自有适配层调用 `@xhmikosr/decompress`，且不得把库返回的条目数组暴露给安装调用方。成功写盘后，适配层 MUST 清除每个条目的 `data` Buffer 引用、清空条目集合并丢弃返回值，使内容在没有其他引用时可由 V8 回收；系统 SHALL NOT 通过强制 `global.gc()` 承诺立即降低进程 RSS。

#### Scenario: 解压成功后释放条目引用

- **WHEN** `@xhmikosr/decompress` 返回包含文件 Buffer 的条目数组
- **THEN** 适配层在返回安装流程前替换或移除全部 `entry.data` 引用并清空数组
- **AND** 安装流程不保存该条目数组

#### Scenario: 解压失败

- **WHEN** 解压库在返回条目数组前抛出错误
- **THEN** 系统传播安装失败并清理临时目录
- **AND** 系统不尝试以强制 GC 作为错误恢复手段

### Requirement: 当前精选目录限定 Registry Agent 的成员范围

系统 SHALL 只把当前精选目录中的 Registry Agent 作为发现、安装、更新和全局预热候选。仅存在于历史 `installed.json`、但当前精选目录中没有相同 ID 的记录 SHALL NOT 被重新加入目录或全局预热队列。系统 SHALL NOT 为这类历史记录保存或恢复 manifest 快照，也 SHALL NOT 查询官方 Registry 进行兼容。

#### Scenario: 历史 installed record 不在精选目录

- **WHEN** `installed.json` 包含某个 Registry Agent ID，但当前精选目录没有该 ID
- **THEN** 系统不在 Agent 目录中展示该记录
- **AND** 系统不把该记录加入全局预热队列
- **AND** 系统不查询官方 Registry 恢复该 Agent

#### Scenario: installed record 仍在精选目录

- **WHEN** `installed.json` 包含某个 Registry Agent ID，且当前精选目录仍包含该 ID
- **THEN** 系统把该 Agent 视为当前目录中的已安装 Agent
- **AND** 系统允许其进入全局预热候选集合
