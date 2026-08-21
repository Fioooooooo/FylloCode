## 1. 扩展共享契约与运行时依赖

- [x] 1.1 在 main worktree 首次执行项目命令前运行 `sh scripts/prepare-worktree-env.sh`，把 `@xhmikosr/decompress@^11.1.4` 加入 `package.json#dependencies` 并更新 `pnpm-lock.yaml`；确认它不是 devDependency，且锁定结果不会解析到 11.1.3 或更低版本。
- [x] 1.2 更新 `src/shared/types/acp-agent.ts`：为 binary distribution 增加可选 `sha256?: string`，为 `AcpRegistryCache` 增加来源身份；保持旧缓存 JSON 可被安全识别但不能作为精选缓存返回，不修改 `AcpInstalledRecord` schema。
- [x] 1.3 在 `src/main/types/` 增加 `@xhmikosr/decompress` 的最小声明，只描述项目实际调用的输入、输出条目与 `data` Buffer；不得在业务层散布 `any` 或复制第三方库无关 API。

## 2. 建立跨平台解压边界

- [x] 2.1 新增 `src/main/infra/archive/decompress.ts`，封装 `@xhmikosr/decompress` 为只返回 `Promise<void>` 的项目函数；调用方只能提供归档路径和独立输出目录，不能获得第三方条目数组。
- [x] 2.2 在解压适配层成功路径的 `finally` 中把每个可写 `entry.data` 替换为零长度 Buffer、清空结果数组并解除局部引用；失败时传播原始错误，不调用 `global.gc()`，也不把主动释放描述为峰值内存控制。
- [x] 2.3 新增 `test/main/infra/archive/decompress.spec.ts`：通过 mock 捕获第三方返回数组，验证函数返回前所有 `data` 已清空且数组长度为零；覆盖库抛错的传播行为，并验证适配层不向调用方返回条目。
- [x] 2.4 为 ZIP、TAR、TAR.GZ/TGZ、TAR.BZ2/TBZ2 添加小型归档夹具或测试时生成器，验证适配层无需系统 `unzip`、`tar`、`bzip2` 或 7-Zip 即可正确写盘；覆盖损坏/不受支持内容会失败的用例。

## 3. 切换并隔离 Registry 来源

- [x] 3.1 更新 `src/main/infra/storage/acp-registry-cache.ts`，把唯一远端 URL 设为 `https://curated-acp-agents.onrender.com/registry.json`；`refreshRegistry()` 只请求该地址，并把稳定来源身份写入缓存。
- [x] 3.2 调整 `getRegistry()` 的有效缓存与 stale-while-revalidate 分支：只有来源匹配的缓存才能返回；缺少来源或来自其他地址的旧缓存必须触发精选源刷新，刷新失败时不得退回官方源。
- [x] 3.3 保持 Registry 顶层解析对 `curation` 和其他未知扩展开放，只校验调用方必需的 `agents` 结构；缓存保留完整响应，目录调用方继续读取 `agents`。
- [x] 3.4 扩展 `test/main/infra/storage/acp-registry-cache.test.ts`：断言请求地址、带扩展字段的响应、来源写入、旧无来源缓存、来源不匹配缓存、同来源过期缓存刷新失败以及全程没有官方源回退。

## 4. 落地可选但严格的 SHA-256 校验

- [x] 4.1 重构 `src/main/services/platform/acp-agent/installer.ts#downloadFile`，在现有磁盘写入流上用 `createHash("sha256")` 增量计算并返回实际摘要，保持下载内容不整体读入内存。
- [x] 4.2 在 binary 安装入口中先校验 `sha256` 是否为 64 位十六进制；存在合法摘要时，在调用解压适配层和替换最终目录前用固定长度 Buffer 与 `timingSafeEqual()` 比较，不匹配只清理本次临时目录并失败，不得删除或改写已有 `finalDirectory`。
- [x] 4.3 保持 `sha256` 缺失时继续安装的分支，不写入或输出“已验证”状态；删除现有系统 `unzip`/`tar` 与未知归档静默复制分支，统一调用 infra 解压适配层，同时保留 `assertNoPathEscape` 与可执行文件解析。
- [x] 4.4 重构最终目录提交：所有校验均在系统临时目录完成，再把验证后的目录复制到 `finalDirectory` 同父级的唯一 staging 目录；替换已有安装时依次执行旧正式目录原子 rename 到 backup、staging 原子 rename 到正式目录、权限处理，并通过 `installed.json` 同父级临时文件和原子 rename 写入 installed record，全部成功后才删除 backup。任一步失败都删除未完成的新目录、恢复 backup，且原子记录写入不得破坏旧 installed record；首次安装失败只清理 staging/新目录。异常处理不得再无条件删除 `finalDirectory`。
- [x] 4.5 扩展 `test/main/services/platform/acp-agent/installer.spec.ts`：覆盖摘要匹配、大小写十六进制、摘要缺失、格式非法和内容不匹配；断言摘要失败、解压失败、staging 复制失败、rename 失败、权限处理失败及 installed record 写入失败时，旧安装和旧记录保持不变，首次安装不遗留目录或记录；同时覆盖 Goose `.tar.bz2`、ZIP、TGZ、损坏归档及路径逃逸防护。

## 5. 对齐精选目录成员与预热边界

- [x] 5.1 保持 `src/main/infra/acp/agent-catalog.ts` 以当前精选 Registry 与 custom Agent 为唯一目录入口；不得反向扫描 `installed.json` 把当前精选目录之外的历史 Registry ID 加回发现、安装或更新集合。
- [x] 5.2 检查 `src/main/services/platform/acp-agent/connection-warmup.ts#resolveInstalledAgentIds` 的现有交集逻辑并补充测试：当前精选目录中具有 installed record 的 Registry Agent 与有效 custom Agent 进入预热集合；仅存在于 `installed.json` 的历史 ID 被忽略，且不触发官方 Registry 请求。
- [x] 5.3 不修改 `AcpInstalledRecord`、不新增 manifest 快照或升级迁移，也不为精选目录之外的历史安装增加 process pool、spawned Session 或卸载兼容分支；通过 `test/main/services/platform/acp-agent/connection-warmup.spec.ts` 和 `test/main/infra/acp/agent-catalog.test.ts` 固化该范围。

## 6. 验证与收尾

- [x] 6.1 运行聚焦测试：`pnpm test -- test/main/infra/archive/decompress.spec.ts test/main/infra/storage/acp-registry-cache.test.ts test/main/services/platform/acp-agent/installer.spec.ts test/main/services/platform/acp-agent/connection-warmup.spec.ts test/main/infra/acp/agent-catalog.test.ts`，修复所有回归并记录结果。
- [x] 6.2 运行 `pnpm typecheck:node` 与 `pnpm typecheck:web`，确认共享类型变更不会破坏主进程、preload 或 renderer 使用方。
- [x] 6.3 运行 `pnpm lint` 并为冷启动预留约 5 分钟；若测试仅因明确的沙箱网络限制失败，按项目知识说明原因并经权限流程在沙箱外重跑，普通断言失败不得归因于沙箱。
- [x] 6.4 检查本次修改是否引入现有 `guidelines/` 未覆盖的新命令、架构边界、测试方式、迁移规则、数据契约或项目约定；只有确有缺口时才按对应 guideline 维护流程更新文档。
- [x] 6.5 不主动执行 `pnpm build`；只有用户针对本次 Apply 明确授权且确有完整构建必要时才运行，并单独报告构建结果。
