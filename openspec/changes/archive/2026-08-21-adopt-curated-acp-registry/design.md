## Context

当前 Registry 读取层把官方 URL 写死在 `src/main/infra/storage/acp-registry-cache.ts`，缓存文件只记录 `fetchedAt` 与响应数据，因此切换来源后仍可能在缓存有效期内返回旧官方列表。安装器位于 `src/main/services/platform/acp-agent/installer.ts`：下载使用磁盘流，但不计算摘要；解压依赖宿主的 `unzip`/`tar`，扩展名识别也会把 `.tar.bz2` 退化为 `.bz2`，无法覆盖精选源中的 Goose 分发。

`@xhmikosr/decompress` 可以在 Node.js 内统一处理当前需要的 ZIP、TAR、TAR.GZ/TGZ 与 TAR.BZ2/TBZ2，避免外部二进制依赖；11.1.4 修复了符号链接链导致的路径逃逸问题，因此低于该版本不能进入运行时依赖。该库会把压缩包与返回条目数据读入内存，即使提供输出目录也会返回包含 `data` Buffer 的条目数组。主动解除返回值引用只能让成功解压后的 Buffer 尽早具备被 V8 回收的条件，不能降低解压期间的峰值内存，也不保证 RSS 立即下降。

`acp/installed.json` 是历史状态，而精选目录是当前允许发现与预热的集合。来源切换后可能存在“有 installed record、但不在精选目录”的 Agent；本变更明确忽略这类记录，不为其恢复 manifest、启动、卸载或预热能力，也不回退官方源。

## Goals / Non-Goals

**Goals**

- 以 curated-acp-agents 作为唯一远端 Registry，并让缓存与来源身份绑定。
- 对 manifest 提供的 SHA-256 执行严格、解压前校验；未提供摘要时维持可安装语义。
- 用纯 Node.js 的统一适配层跨平台解压精选源当前使用的归档格式，包括 Goose 的 `.tar.bz2`。
- 封装 `@xhmikosr/decompress` 返回对象的生命周期，在写盘后尽早解除条目 Buffer 引用。
- 让当前精选目录成为 Registry Agent 发现与全局预热的唯一成员集合。

**Non-Goals**

- 不合并官方 Registry、不提供多源配置，也不设计官方源故障回退。
- 不把 initialize 握手、精选元数据或摘要存在性解释为完整的 Agent 功能认证。
- 不增加签名验证、镜像、下载重试策略或归档体积上限。
- 不承诺主动解除 Buffer 引用会立即归还操作系统内存，也不启用 `global.gc()`。
- 不兼容仅存在于历史 `installed.json`、但已不在精选目录中的 Agent；不为其增加 manifest 快照、数据迁移、启动、卸载或预热回退。

## Decisions

### 1. Registry 读取保持单源，缓存显式记录来源

在 `src/main/infra/storage/acp-registry-cache.ts` 中用单一常量定义精选 URL，并给 `AcpRegistryCache` 增加稳定的 `source` 字段。`refreshRegistry()` 只请求精选 URL，写缓存时同时写入来源；`getRegistry()` 只有在缓存 `source` 与当前来源完全一致时才允许走有效缓存或 stale-while-revalidate。缺少 `source` 或来源不匹配的旧缓存直接忽略，不参与任何迁移或历史信息恢复；精选源成功刷新后以带正确来源的新内容覆盖缓存。

Registry 解析只要求顶层存在合法 `agents` 数组；`curation` 等已知或未知扩展字段均允许存在并随原始响应缓存。现有目录调用方继续消费 `agents`，不把扩展字段设成加载前置条件。

备选方案是直接替换 URL 并复用旧缓存格式。该方案会让来源切换受 24 小时缓存窗口影响，用户可能继续看到官方 Agent，因此拒绝。

### 2. 在下载磁盘流上增量计算 SHA-256

给 `AcpAgentBinaryDistribution` 增加可选 `sha256?: string`。安装器先用 `/^[a-fA-F0-9]{64}$/` 校验 manifest 值；非法值在发起解压前直接失败。`downloadFile()` 在现有写文件流上同步更新 `createHash("sha256")`，完成后返回实际十六进制摘要。提供期望摘要时，将双方解码为固定长度 Buffer 并用 `timingSafeEqual()` 比较；不匹配时只清理本次临时目录并终止，不创建新的 installed record，也不删除或改写已有最终安装目录。

未提供 `sha256` 时仍使用相同下载路径，但不进行对比，也不在持久化状态或日志中声称“已验证”。摘要校验发生在解压之前，以免不可信内容进入解压器。

安装提交采用明确的可恢复阶段：下载、摘要校验、解压、路径审计与可执行文件解析均只操作系统临时目录；全部成功后，先把验证完成的目录复制到 `finalDirectory` 同父级的唯一 staging 目录，确保后续 rename 不跨文件系统。若已有正式安装，先把 `finalDirectory` 原子重命名为同父级 backup，再把 staging 原子重命名为 `finalDirectory`。新目录权限处理完成后，将更新后的 installed map 写入 `installed.json` 同父级临时文件并原子 rename，避免记录写入失败覆盖旧文件；目录和记录均提交成功后，才删除 backup 并宣告完成。

从旧目录移入 backup 开始，到 installed record 成功写入之前的任一步失败，都必须删除未完成的新正式目录、恢复 backup，并保留旧 installed record；首次安装失败则删除 staging 或未完成的新正式目录，不创建 installed record。摘要格式非法、摘要不匹配、下载失败、解压失败和路径审计失败发生在提交前，只能清理本次临时资源，不得触碰已有正式目录。异常处理不得无条件删除 `finalDirectory`。

备选方案是下载完成后再读一遍文件计算摘要。增量计算不增加第二次磁盘 I/O，且不改变当前流式下载的内存特征，因此采用增量方案。

### 3. 由 infra 解压适配层封装 `@xhmikosr/decompress`

新增 `src/main/infra/archive/decompress.ts`，导出返回 `Promise<void>` 的项目级解压函数。适配层是唯一允许直接导入 `@xhmikosr/decompress` 的位置；安装器只传入下载文件和独立临时输出目录，不接触库返回的条目。依赖以 `@xhmikosr/decompress@^11.1.4` 放入 `package.json#dependencies`，并在 `src/main/types/` 补充最小、项目所需的声明文件。

适配层依赖库的格式探测和内置插件处理 ZIP、TAR、TAR.GZ/TGZ 与 TAR.BZ2/TBZ2。无法识别、损坏或未完整解析的输入直接传播错误。安装器删除当前调用系统 `unzip`/`tar` 以及“未知扩展名按普通文件复制”的归档分支，但保留解压后 `realpath` 路径审计与临时目录提交机制，作为对第三方库校验之外的纵深防护。

备选方案包括继续补齐各平台系统命令或捆绑 7-Zip。它们分别带来环境差异或额外二进制供应链与打包维护成本；当前格式集合无需这些能力。

### 4. 适配层拥有并主动解除解压结果引用

`@xhmikosr/decompress` 成功返回后，适配层在 `finally` 路径遍历条目，将每个可写 `entry.data` 替换为零长度 Buffer，再把结果数组长度设为 `0`，随后让局部变量离开作用域。适配层不返回条目数组，安装器也不保存其中任何引用。

若库在返回数组前抛错，适配层没有可释放的返回对象，只传播错误；安装器现有的外层 `finally` 负责清理临时根目录。代码不调用 `global.gc()`，因为生产 Electron 默认不暴露它，而且即便可调用也不能保证 RSS 行为。

这一封装解决的是成功解压后的可达性，而不是峰值内存。大型归档在解压期间仍可能同时占用压缩包和条目 Buffer；本次不引入未经需求确认的大小上限。若精选源未来出现足以造成稳定性问题的大型产物，应另行评估真正流式且覆盖所需格式的解压实现。

### 5. 历史 installed record 不扩展当前目录边界

`agent-catalog.ts` 继续以当前精选 Registry 与 custom Agent 为目录入口。全局预热先从这个当前目录取得候选项，再用 installed records 判断其中哪些 Registry Agent 已安装；它不会反向遍历 `installed.json` 把精选目录之外的历史 ID 加回目录或预热队列。

本变更不修改 `AcpInstalledRecord` schema，不保存 manifest 快照，也不创建数据迁移。精选目录之外的历史安装可能无法被发现、预热、启动或卸载，这是明确接受的范围结果。系统不得为了恢复这类记录而查询官方 Registry。

备选方案是固化 manifest 并迁移旧缓存。该方案增加持久化契约与多条运行时兼容路径，而当前决策明确不处理这类历史安装，因此拒绝。

## Risks / Trade-offs

- **[内存峰值仍与归档和解压内容大小相关]** → 解除引用仅缩短成功后的可达时间；测试明确这一边界，运行日志保留失败上下文，未来根据真实归档规模决定是否替换为流式实现。
- **[精选源不可用时没有官方回退]** → 这是“只保留精选”的产品决策；只允许同来源缓存提供陈旧数据，并把无可用缓存时的错误显式返回。
- **[未提供 SHA-256 的下载仍缺乏内容完整性证明]** → 如实继续安装且不标记为已验证；一旦字段存在就严格校验，不允许软失败。
- **[第三方解压库的供应链与路径安全风险]** → 锁定至少 11.1.4，保留锁文件审查与解压后的本地路径审计，不捆绑额外可执行文件。
- **[精选目录之外的历史安装可能成为孤立本地文件]** → 这是明确接受的产品取舍；不扫描、不迁移、不回退官方源，也不把它们加入发现或预热集合。
- **[升级提交失败可能损伤旧安装]** → 所有验证在临时目录完成，最终替换使用同父目录备份与恢复流程；测试覆盖摘要失败、解压失败和提交失败时旧目录保持不变。

## Migration Plan

1. 先落地类型、解压适配层与生产依赖，使后续安装路径可编译。
2. 切换 Registry URL 与来源隔离逻辑。即使旧缓存仍在有效期内，也不会作为精选目录返回。
3. 接入下载摘要校验、统一解压、主动引用释放，以及经过同父级 staging、backup 恢复和 installed record 提交边界保护的最终目录替换。
4. 对齐全局预热规范与测试，确认仅当前精选目录中的已安装 Registry Agent 会进入预热队列。
5. 通过聚焦测试、Node/Web 类型检查和 lint 验证行为；最后确认生产依赖可被 Electron main 解析。

回滚时可恢复旧 Registry URL 与原安装器路径；带 `source` 的缓存字段可被旧版本忽略。`installed.json` 没有 schema 变化，也没有迁移需要回滚。

## Open Questions

无。单一精选源、SHA-256 的可选严格语义、`@xhmikosr/decompress` 选型以及主动解除返回 Buffer 引用均已确认。
