# Local File Preview

为所有 MarkStream 宿主提供统一的本地文件只读预览。Feature 只在链接激活后创建全局
Slideover，并通过 `workspace.document` API 让主进程完成路径、授权和文件内容校验。

## 分层

- `model/`：本地链接识别和预览状态。
- `application/`：prepare / confirm 状态机与竞态隔离。
- `ui/`：Markstream link node 和只读预览 Slideover。
- `integration/`：Markstream host context、Nuxt UI overlay 与 workspace API 装配。

外部宿主使用 `@renderer/features/local-file-preview/integration`，不得深路径导入内部实现。
