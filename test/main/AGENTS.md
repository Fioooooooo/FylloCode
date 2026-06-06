# Main Process Test Guide

## 目录结构

```
test/main/
├── setup.ts
├── bootstrap/
├── domain/
├── infra/
├── ipc/
└── services/
```

## 约定

- 测试统一放在 `test/main/` 下，不与 `src/main/` 源码并置
- 运行环境为 Node，依赖 Electron 的能力通过 `setup.ts` mock
- 测试优先覆盖 `domain/`、`infra/`、`services/` 和 `ipc/_kit/`
- 导入实现时优先使用 `@main/*` 和 `@shared/*` 别名
