# 用 FylloCode 开发 FylloCode

FylloCode 自身也在用 FylloCode 开发。对于参与贡献者，推荐使用 Releases 中的打包版本，而不是直接用开发模式启动 FylloCode 来修改 FylloCode。

原因是 `electron-vite` 的[热重载](https://electron-vite.org/guide/hmr-and-hot-reloading)只是自动重新构建并重启 Electron 应用，并不是真正意义上的热更新。执行阶段一旦修改源码，热重载可能会打断正在运行的工作流。打包版本不会被当前源码改动影响。

## 推荐流程

1. 下载最新 Release 版本
2. 打开 FylloCode 仓库作为项目
3. 在 Task 中描述你要修复的问题或要做的改动
4. 在对话里和 Agent 收敛方案，再走 Proposal → Apply & Archive
5. 回到代码仓库检查 diff、测试结果和归档内容

## 什么时候可以直接提交 PR

这些改动通常可以直接提交：

- 文档错字
- 小范围 UI 文案修正
- 明确且低风险的小 bug
- 不改变外部行为的测试补充

这些改动建议先开 Issue 讨论：

- 新功能
- 架构调整
- IPC、存储格式或共享类型变化
- 用户可见行为变化
- 大范围重构

## 本地开发命令

```bash
pnpm install
pnpm dev
```

提交前至少运行：

```bash
pnpm lint
pnpm typecheck
```

更多贡献约定见 [贡献指南](/docs/contributing)。
